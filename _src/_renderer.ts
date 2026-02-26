import { mat4, Mat4, Vec3, vec3, Vec4 } from "wgpu-matrix";
import shaderCode from "./shader.wgsl?raw";
import MeshComponent from "../ecs/components/mesh.component";

export type Helios2_Buffers = {
  vertex: GPUBuffer; // Vertices
  index: GPUBuffer; // Indices
  normal: GPUBuffer; // Normals
  indirect: GPUBuffer; // Indirect draw commands
  instance: GPUBuffer; // Mat4 matrix + Vec4 color
  uniform: GPUBuffer; // aspect
  visible: GPUBuffer;
};

function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export class Helios2Renderer {
  // A simple multidrawindexedindirect renderer
  // no culling or compute shader

  static readonly BUFFERS_STRIDES_BYTES = {
    vertex: 3 * 4,
    normal: 3 * 4,
    index: 4, // uint16
    indirect: 5 * 4, // 5 uint32
    instance: (16 + 4 + 4) * 4, // Mat4 (16) + Vec4 (4)
    uniform: (16 + 24 + 4) * 4, // viewProj (16) + planes (24) + time (1) + instanceCount (1) + padding (2)
    visible: 4, // uint32
  };

  static readonly UP = vec3.create(0, 1, 0);
  static readonly CENTER = vec3.zero();

  public _ready: boolean = false;

  public buffers: Helios2_Buffers | null = null;

  /**
   * Meshes uploaded to the GPU
   *
   * byte layout:
   * mesh id: uint32
   * vertex byte count: uint32
   * vertex byte offset: uint32
   * index byte count: uint32
   * index byte offset: uint32
   * normal byte count: uint32
   * normal byte offset: uint32
   */
  private meshes: {
    buffer: Uint32Array;
    meshCount: number;
    vertexCursor: number;
    indexCursor: number;
    normalCursor: number;
    commandsCursor: number;
  } = {
    buffer: new Uint32Array(opulence_config.render.maxMeshes * 5),
    meshCount: 0,
    vertexCursor: 0,
    indexCursor: 0,
    normalCursor: 0,
    commandsCursor: 0,
  };

  private instances: {
    buffer: Float32Array;
    instanceCount: number;
  } = {
    buffer: new Float32Array(opulence_config.render.maxInstances * 20),
    instanceCount: 0,
  };

  private canvas: HTMLCanvasElement;
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private adapter: GPUAdapter;
  private format: GPUTextureFormat;

  private depthTexture: GPUTexture;
  private pipeline: GPURenderPipeline;
  private cullingPipeline: GPUComputePipeline;
  private resetPipeline: GPUComputePipeline;

  private UniformBindGroup: GPUBindGroup;
  private InstanceBindGroup: GPUBindGroup;
  private IndicrectComputeBindGroup: GPUBindGroup;

  private UniformLayout: GPUBindGroupLayout;
  private InstanceLayout: GPUBindGroupLayout;
  private IndicrectComputeLayout: GPUBindGroupLayout;

  public cameraPosition: Vec3 = vec3.create(0, 0, 0);
  public cameraRotation: Vec3 = vec3.create(0, 0, 0);

  private projectionMatrix: Mat4 = mat4.identity();
  private viewMatrix: Mat4 = mat4.identity();

  private frustrumPlanes: Float32Array = new Float32Array(24); // 6 planes * 4 components

  private aspect: number;

  private slider: HTMLInputElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    this.canvas.width = document.body.clientWidth * devicePixelRatio;
    this.canvas.height = document.body.clientHeight * devicePixelRatio;

    this.slider = document.getElementById("fov") as HTMLInputElement;

    this.aspect = this.canvas.width / this.canvas.height;

    mat4.perspective(
      degToRad(90),
      this.aspect,
      0.1,
      100.0,
      this.projectionMatrix,
    );

    // mat4.ortho(
    //   0,
    //   window.innerWidth,
    //   window.innerHeight,
    //   0,
    //   0.01,
    //   1000,
    //   this.projectionMatrix,
    // );

    setInterval(() => {
      const readBack = this.device.createCommandEncoder();
      const copySize = 4;
      readBack.copyBufferToBuffer(
        this.debugBuffer,
        0,
        this.readbackBuf,
        0,
        1024,
      );
      this.device.queue.submit([readBack.finish()]);

      this.readbackBuf.mapAsync(GPUMapMode.READ).then(() => {
        const array = new Uint32Array(this.readbackBuf.getMappedRange());
        // console.log("Culled draw calls: ", Uint32Array.from(array));
        this.readbackBuf.unmap();
      });
    }, 1000);
  }

  private _getMeshData(meshIndex: number): {
    meshId: number;
    vertexByteCount: number;
    vertexByteOffset: number;
    indexByteCount: number;
    indexByteOffset: number;
  } {
    const meshData = this.meshes.buffer.subarray(
      meshIndex * 5,
      meshIndex * 5 + 5,
    );

    return {
      meshId: meshData[0],
      vertexByteCount: meshData[1],
      vertexByteOffset: meshData[2],
      indexByteCount: meshData[3],
      indexByteOffset: meshData[4],
    };
  }

  public _instantiate(
    meshIndex: number,
    matrix: Float32Array,
    color: Float32Array,
  ) {
    const instance = this.instances.instanceCount++;
    const meshData = this._getMeshData(meshIndex);

    const instanceData = new Float32Array(
      Helios2Renderer.BUFFERS_STRIDES_BYTES.instance / 4,
    );
    instanceData.set(matrix, 0);
    instanceData.set(color, 16);
    instanceData.set([this.meshes.commandsCursor, 0, 0, 0], 20);

    this.device.queue.writeBuffer(
      this.buffers.instance,
      instance * Helios2Renderer.BUFFERS_STRIDES_BYTES.instance,
      instanceData.buffer,
      0,
      instanceData.byteLength,
    );

    const indirectData = new Uint32Array([
      meshData.indexByteCount / 4, // index count
      0, // instance count
      meshData.indexByteOffset / 4, // first index
      meshData.vertexByteOffset / Helios2Renderer.BUFFERS_STRIDES_BYTES.vertex, // vertex offset
      instance, // first instance
    ]);

    this.device.queue.writeBuffer(
      this.buffers.indirect,
      this.meshes.commandsCursor * 5 * 4,
      indirectData.buffer,
      0,
      indirectData.byteLength,
    );

    console.log(
      `Instantiated single mesh ${instance} at command ${this.meshes.commandsCursor}`,
    );

    this.meshes.commandsCursor++;

    return instance;
  }

  public _instantiateBatch(
    meshId: number,
    instanceValues: { matrix: Mat4; color: Vec4 }[],
  ) {
    const startInstance = this.instances.instanceCount;
    const meshData = this._getMeshData(meshId);

    const instanceData = new Float32Array(instanceValues.length * 24);

    instanceValues.forEach((instance, index) => {
      this.instances.instanceCount++;

      const offset = index * 24;
      instanceData.set(instance.matrix, offset);
      instanceData.set(instance.color, offset + 16);
      instanceData.set([this.meshes.commandsCursor, 0, 0, 0], offset + 20);
    });

    this.device.queue.writeBuffer(
      this.buffers.instance,
      startInstance * Helios2Renderer.BUFFERS_STRIDES_BYTES.instance,
      instanceData.buffer,
      0,
      instanceData.byteLength,
    );

    const indirectData = new Uint32Array([
      meshData.indexByteCount / 4, // index count
      0, // instance count
      meshData.indexByteOffset / 4, // first index
      meshData.vertexByteOffset / Helios2Renderer.BUFFERS_STRIDES_BYTES.vertex, // vertex offset
      startInstance, // first instance
    ]);

    this.device.queue.writeBuffer(
      this.buffers.indirect,
      this.meshes.commandsCursor * 5 * 4,
      indirectData.buffer,
      0,
      indirectData.byteLength,
    );

    console.log(
      `Instantiated ${instanceData.length / 24} meshes at command ${this.meshes.commandsCursor}`,
    );

    this.meshes.commandsCursor++;

    return startInstance;
  }

  public _updateMatrix(instanceId: number, matrix: Mat4) {
    const offset = (instanceId - 1) * Helios2Renderer.BUFFERS_STRIDES_BYTES.instance;
    const matrixData = new Float32Array(matrix);

    this.device.queue.writeBuffer(
      this.buffers.instance,
      offset,
      matrixData.buffer,
      0,
      matrixData.byteLength,
    );
  }

  private culling_pass() {}

  private updateUniforms(t: number) {
    mat4.identity(this.viewMatrix);

    mat4.rotateX(
      this.viewMatrix,
      degToRad(this.cameraRotation[0]),
      this.viewMatrix,
    );
    mat4.rotateY(
      this.viewMatrix,
      degToRad(this.cameraRotation[1]),
      this.viewMatrix,
    );
    mat4.rotateZ(
      this.viewMatrix,
      degToRad(this.cameraRotation[2]),
      this.viewMatrix,
    );
    mat4.translate(
      this.viewMatrix,
      vec3.negate(this.cameraPosition, vec3.create()),
      this.viewMatrix,
    );

    const viewProjectionMatrix = mat4.mul(
      this.projectionMatrix,
      this.viewMatrix,
    );

    this.frustrumPlanes = extractFrustumPlanes(viewProjectionMatrix);

    const uniformBuffer = new ArrayBuffer(
      Helios2Renderer.BUFFERS_STRIDES_BYTES.uniform,
    );
    const f32 = new Float32Array(uniformBuffer);
    const u32 = new Uint32Array(uniformBuffer);

    f32.set(viewProjectionMatrix, 0);
    f32.set(this.frustrumPlanes, 16);
    f32[40] = t;
    u32[41] = this.instances.instanceCount;

    this.device.queue.writeBuffer(this.buffers.uniform, 0, uniformBuffer);
  }

  readbackBuf: GPUBuffer;
  textureView: GPUTextureView;
  depthTextureView: GPUTextureView;

  public render(t: number) {
    const commandEncoder = this.device.createCommandEncoder();
    this.updateUniforms(t);

    const resetPass = commandEncoder.beginComputePass();
    resetPass.setPipeline(this.resetPipeline);
    resetPass.setBindGroup(0, this.UniformBindGroup);
    resetPass.setBindGroup(1, this.IndicrectComputeBindGroup);
    resetPass.dispatchWorkgroups(Math.ceil(this.meshes.commandsCursor / 64));
    resetPass.end();

    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(this.cullingPipeline);
    computePass.setBindGroup(0, this.UniformBindGroup);
    computePass.setBindGroup(1, this.IndicrectComputeBindGroup);
    computePass.setBindGroup(2, this.debugBindGroup);

    computePass.dispatchWorkgroups(
      Math.ceil(this.instances.instanceCount / 64),
    );
    computePass.end();

    this.textureView = this.context.getCurrentTexture().createView();

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.textureView,
          clearValue: { r: 0.3, g: 0.3, b: 0.3, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: this.depthTextureView,
        depthClearValue: 1.0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });

    renderPass.setPipeline(this.pipeline);
    renderPass.setBindGroup(0, this.UniformBindGroup);
    renderPass.setBindGroup(1, this.InstanceBindGroup);
    renderPass.setVertexBuffer(0, this.buffers.vertex);
    renderPass.setVertexBuffer(1, this.buffers.normal);
    renderPass.setIndexBuffer(this.buffers.index, "uint32");
    // Experimental function - not standardized yet
    (renderPass as any).multiDrawIndexedIndirect(
      this.buffers.indirect,
      0,
      this.meshes.commandsCursor,
    );

    renderPass.end();

    this.device.queue.submit([commandEncoder.finish()]);

    // if (this.readbackBuf.mapState === "unmapped") {
    //   this.readbackBuf.mapAsync(GPUMapMode.READ).then(() => {
    //     const array = new Uint32Array(this.readbackBuf.getMappedRange());
    //     console.log(array[0]);
    //     this.readbackBuf.unmap();
    //   });
    // }
  }

  public uploadMesh(
    vertices: Float32Array,
    indices: Uint32Array,
    normals: Float32Array,
  ): number {
    if (this._ready && this.buffers != null) {
      this.device.queue.writeBuffer(
        this.buffers.vertex,
        this.meshes.vertexCursor,
        vertices.buffer,
      );
      this.device.queue.writeBuffer(
        this.buffers.index,
        this.meshes.indexCursor,
        indices.buffer,
      );

      this.device.queue.writeBuffer(
        this.buffers.normal,
        this.meshes.normalCursor,
        normals.buffer,
      );

      const meshData = new Uint32Array([
        this.meshes.meshCount,
        vertices.byteLength,
        this.meshes.vertexCursor,
        indices.byteLength,
        this.meshes.indexCursor,
      ]);

      this.meshes.buffer.set(meshData, this.meshes.meshCount * 5);

      this.meshes.vertexCursor += vertices.byteLength;
      this.meshes.indexCursor += indices.byteLength;
      this.meshes.normalCursor += normals.byteLength;
      this.meshes.meshCount++;

      return this.meshes.meshCount - 1;
    } else {
      throw new Error("Renderer not initialized or buffers not ready.");
    }
  }

  public async initialize() {
    if (!navigator.gpu) {
      throw new Error("WebGPU not supported on this browser.");
    }

    this.adapter = await navigator.gpu.requestAdapter({
      powerPreference: "high-performance",
    });
    if (!this.adapter) throw new Error("No suitable GPU adapter found.");

    this.device = await this.adapter.requestDevice({
      requiredFeatures: ["chromium-experimental-multi-draw-indirect"] as any,
    });

    // Add error handling for uncaptured errors
    this.device.addEventListener("uncapturederror", (event) => {
      // console.error("WebGPU uncaptured error:", event.error);
    });

    this.context = this.canvas.getContext("webgpu") as GPUCanvasContext;

    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "premultiplied",
    });

    this.buffers = {} as any;
    this.initialize_buffers();

    const shaderModule = this.device.createShaderModule({
      code: shaderCode,
    });

    this.UniformLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility:
            GPUShaderStage.VERTEX |
            GPUShaderStage.FRAGMENT |
            GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
      ],
    });

    this.UniformBindGroup = this.device.createBindGroup({
      layout: this.UniformLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.buffers.uniform,
          },
        },
      ],
    });

    this.InstanceLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "read-only-storage" },
        },
      ],
    });

    this.InstanceBindGroup = this.device.createBindGroup({
      layout: this.InstanceLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.buffers.instance,
          },
        },
        {
          binding: 1,
          resource: {
            buffer: this.buffers.visible,
          },
        },
      ],
    });

    this.IndicrectComputeLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "read-only-storage" },
        },
      ],
    });

    this.IndicrectComputeBindGroup = this.device.createBindGroup({
      layout: this.IndicrectComputeLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.buffers.indirect,
          },
        },
        {
          binding: 1,
          resource: {
            buffer: this.buffers.visible,
          },
        },
        {
          binding: 2,
          resource: {
            buffer: this.buffers.instance,
          },
        },
      ],
    });

    this.debugLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
      ],
    });

    this.debugBindGroup = this.device.createBindGroup({
      layout: this.debugLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.debugBuffer,
          },
        },
      ],
    });

    this.pipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this.UniformLayout, this.InstanceLayout],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
        buffers: [
          {
            arrayStride: 3 * 4,
            stepMode: "vertex",
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: "float32x3",
              },
            ],
          },
          {
            arrayStride: 3 * 4,
            stepMode: "vertex",
            attributes: [
              {
                shaderLocation: 1,
                offset: 0,
                format: "float32x3",
              },
            ],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [
          {
            format: this.format,
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
        cullMode: "back",
      },
      depthStencil: {
        format: "depth24plus",
        depthWriteEnabled: true,
        depthCompare: "less",
      },
    });

    this.resetPipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this.UniformLayout, this.IndicrectComputeLayout],
      }),
      compute: {
        module: shaderModule,
        entryPoint: "reset_main",
      },
    });

    this.cullingPipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          this.UniformLayout,
          this.IndicrectComputeLayout,
          this.debugLayout,
        ],
      }),
      compute: {
        module: shaderModule,
        entryPoint: "cull_main",
      },
    });

    this.depthTexture = this.device.createTexture({
      size: {
        width: this.canvas.width,
        height: this.canvas.height,
      },
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.depthTextureView = this.depthTexture.createView();

    this._ready = true;
  }

  initialize_buffers() {
    this.buffers.vertex = this.device.createBuffer({
      size: opulence_config.render.meshPage,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this.buffers.normal = this.device.createBuffer({
      size: opulence_config.render.meshPage,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this.buffers.index = this.device.createBuffer({
      size: opulence_config.render.meshPage,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });

    this.buffers.indirect = this.device.createBuffer({
      size:
        opulence_config.render.maxMeshes *
        Helios2Renderer.BUFFERS_STRIDES_BYTES.indirect,
      usage:
        GPUBufferUsage.INDIRECT |
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.COPY_SRC,
    });

    this.buffers.instance = this.device.createBuffer({
      size:
        opulence_config.render.maxInstances *
        Helios2Renderer.BUFFERS_STRIDES_BYTES.instance,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.buffers.uniform = this.device.createBuffer({
      size: Helios2Renderer.BUFFERS_STRIDES_BYTES.uniform,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.buffers.visible = this.device.createBuffer({
      size:
        opulence_config.render.maxInstances *
        Helios2Renderer.BUFFERS_STRIDES_BYTES.visible,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.readbackBuf = this.device.createBuffer({
      size: 1024,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    this.debugBuffer = this.device.createBuffer({
      size: 1024,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
  }

  debugLayout: GPUBindGroupLayout;
  debugBindGroup: GPUBindGroup;
  debugBuffer: GPUBuffer;
  readbackBuffer: GPUBuffer;
}

function extractFrustumPlanes(m) {
  const planes = new Float32Array(6 * 4); // 6 planes, 4 floats each

  // Helper to set a plane at index 'i'
  const setPlane = (i, x, y, z, w) => {
    // Calculate length for normalization
    const len = Math.sqrt(x * x + y * y + z * z);
    planes[i * 4 + 0] = x / len;
    planes[i * 4 + 1] = y / len;
    planes[i * 4 + 2] = z / len;
    planes[i * 4 + 3] = w / len;
  };

  // In gl-matrix (column-major):
  // R0 (Row 0) = [m[0], m[4], m[8], m[12]]
  // R1 (Row 1) = [m[1], m[5], m[9], m[13]]
  // R2 (Row 2) = [m[2], m[6], m[10], m[14]]
  // R3 (Row 3) = [m[3], m[7], m[11], m[15]]

  // Left: R3 + R0
  setPlane(0, m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]);

  // Right: R3 - R0
  setPlane(1, m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);

  // Bottom: R3 + R1
  setPlane(2, m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]);

  // Top: R3 - R1
  setPlane(3, m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);

  // Near: R3 + R2 (See note below about WebGPU vs OpenGL ranges)
  setPlane(4, m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]);

  // Far: R3 - R2
  setPlane(5, m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]);

  return planes;
}
