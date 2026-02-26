import { Mat4, mat4 } from "wgpu-matrix";
import { RenderPass2D } from "./passes/2dRenderPass";
import { ResourceRegistry } from "./registry";
import { RenderGraph } from "./renderGraph";

type BufferContainer = {
    vertex: GPUBuffer;
    index: GPUBuffer;
    normal: GPUBuffer;
    uv: GPUBuffer;
}

type BufferCursors = {
    vertex: number;
    index: number;
    normal: number;
    uv: number;
}

type SceneBufferFormat = {
    bufferMask: number; // Determines if the object has a vertex buffer, index buffer, normal buffer, and uv buffer
    vertex: {
        addr: number;
        count: number;
    }
    index: {
        addr: number;
        count: number;
    },
    normal?: {
        addr: number;
        count: number;
    },
    uv?: {
        addr: number;
        count: number;
    }
}

interface RenderObject {
    mesh: number;
    material: number;
    matrix: Mat4;
}

export class Renderer {
    adapterConfig: GPURequestAdapterOptions = {
        powerPreference: 'high-performance'
    }

    renderGraph: RenderGraph | undefined;

    adapter: GPUAdapter | undefined;
    device: GPUDevice | undefined;
    context: GPUCanvasContext | undefined;
    format: GPUTextureFormat | undefined;

    registry: ResourceRegistry | undefined;

    sceneBuffer: Uint32Array | undefined;
    sceneBufferCursor: number = 0;
    sceneIndex: {
        vi: number,
        vl: number,
        ii: number,
        il: number,
    }[] = [];

    TEMP_cameraBuffer: GPUBuffer | undefined;

    render() {
        if (!this.renderGraph) {
            throw new Error("The render graph has not been initialized.")
        }

        const commandEncoder = this.device?.createCommandEncoder();

        this.renderGraph.render(commandEncoder);
    }

    public async initialize(canvas: HTMLCanvasElement) {
        if (!navigator.gpu) {
            throw new Error("WebGPU is not supported in this browser.");
        }

        const adapter = await navigator.gpu.requestAdapter(this.adapterConfig);
        if (!adapter) {
            throw new Error("Failed to create WebGPU Adapter.")
        }
        this.adapter = adapter;

        this.device = await this.adapter.requestDevice();

        this.device.addEventListener("uncapturederror", e => {
            throw new Error("Uncaptured WebGPU Device error: " + e.error.message, { cause: e.error })
        })

        const context = canvas.getContext("webgpu");
        if (!context) {
            throw new Error("Failed to create WebGPU Context.")
        }
        this.context = context;
        this.format = navigator.gpu.getPreferredCanvasFormat();

        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: "premultiplied"
        })

        this.sceneBuffer = new Uint32Array(1024);
        this.registry = new ResourceRegistry(this.device, this.context);
        this._initializeBuffers();
        this.renderGraph = new RenderGraph(this.registry);

        this.renderGraph.passes.push(new RenderPass2D(this.device));

        this.TEMP_cameraBuffer = this.device.createBuffer({
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
    }

    private _initializeBuffers() {
        if (!this.device || !this.registry) {
            throw new Error("WebGPU Device is not initialized.");
        }

        this.registry.declareBuffer("vertex", {
            size: 1024,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        })

        this.registry.declareBuffer("index", {
            size: 1024,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
        })

        this.registry.declareBuffer("normal", {
            size: 1024,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        })

        this.registry.declareBuffer("uv", {
            size: 1024,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        })

        this.registry.declareBuffer("indirect", {
            size: 1024,
            usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST
        })
    }

    public uploadMesh(meshData: {
        vertices: Float32Array;
        indices: Uint16Array;
        normals?: Float32Array;
        uvs?: Float32Array;
    }) {
        this.verifyReadyState();

        const vertexInfo = this.appendVertexData(meshData.vertices);
        const indexInfo = this.appendIndexData(meshData.indices);

        const meshIndex = this.appendToSceneBuffer(vertexInfo, indexInfo);

        console.log("Appending " + meshData.indices.length + " indices and " + meshData.vertices.length + " vertices to the scene buffer. Current scene buffer cursor: " + this.sceneBufferCursor)
        return meshIndex;
    }

    private appendVertexData(data: Float32Array) {
        if (!this.registry) {
            throw new Error("WebGPU Resource Registry is not initialized.");
        }

        this.device?.queue.writeBuffer(this.registry.getBuffer("vertex"), this.registry.getCursor("vertex"), data.buffer);
        this.registry.setCursor("vertex", this.registry.getCursor("vertex") + data.byteLength);

        return { addr: this.registry.getCursor("vertex") - data.byteLength, byteLength: data.byteLength };
    }

    private appendIndexData(data: Uint16Array) {
        if (!this.registry) {
            throw new Error("WebGPU Resource Registry is not initialized.");
        }

        // GPU Buffers have to be aligned to 4 bytes
        if (data.length % 2 == 1) {
            data = new Uint16Array([...data, 0]);
        }

        this.device?.queue.writeBuffer(this.registry.getBuffer("index"), this.registry.getCursor("index"), data.buffer);
        this.registry.setCursor("index", this.registry.getCursor("index") + data.byteLength);

        return { addr: this.registry.getCursor("index") - data.byteLength, byteLength: data.byteLength };
    }

    private appendToSceneBuffer(vertexInfo: { addr: number; byteLength: number }, indexInfo: { addr: number; byteLength: number }) {
        const bufferMask = 0b0011; // For now, we only support vertex and index buffers. In the future, we can add normal and uv buffers as well.
        const dataLength = 5; // bufferMask (1 uint32) + vertexInfo (2 uint32) + indexInfo (2 uint32)

        const buffer = new Uint32Array(dataLength);
        buffer[0] = bufferMask;
        buffer[1] = vertexInfo.addr;
        buffer[2] = vertexInfo.byteLength;
        buffer[3] = indexInfo.addr;
        buffer[4] = indexInfo.byteLength;

        if (!this.sceneBuffer) {
            throw new Error("Scene buffer is not initialized.");
        }

        this.sceneBuffer?.set(buffer, this.sceneBufferCursor);
        this.sceneBufferCursor += dataLength;
        const meshIndex = this.sceneIndex.push({
            vi: vertexInfo.addr,
            vl: vertexInfo.byteLength,
            ii: indexInfo.addr,
            il: indexInfo.byteLength
        });

        return meshIndex - 1;
    }

    public t_renderTriangle() {
        this.verifyReadyState();

        // Temporary camera buffer data (4x4 view-projection matrix)
        const projection = mat4.perspective(Math.PI / 2, this.context!.canvas.width / this.context!.canvas.height, 0.1, 100);
        const view = mat4.lookAt([0, 0, 2], [0, 0, 0], [0, 1, 0]);

        const modelMatrix = mat4.identity();
        mat4.translate(modelMatrix, [0, 0, 0], modelMatrix);
        mat4.rotateY(modelMatrix, performance.now() / 1000, modelMatrix);
        mat4.rotateX(modelMatrix, performance.now() / 1000, modelMatrix);

        const viewProjection = mat4.mul(projection, view);
        const cameraData = mat4.mul(viewProjection, modelMatrix);
        this.device.queue.writeBuffer(this.TEMP_cameraBuffer!, 0, cameraData.buffer);

        const shaderModule = this.device.createShaderModule({
            code: `
struct Uniforms {
    viewProjection: mat4x4<f32>
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) fragPosition: vec4<f32>
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn main(@location(0) position: vec3<f32>) -> VertexOutput {
    var output: VertexOutput;
    output.position = uniforms.viewProjection * vec4<f32>(position, 1.0);
    output.fragPosition = output.position;
    return output;
}
    
@fragment
fn frag_main(@location(0) fragPosition: vec4<f32>) -> @location(0) vec4<f32> {
    
    return vec4<f32>(fragPosition.x , fragPosition.y ,fragPosition.z, 1.0);
}
`
        });

        const layout = this.device.createPipelineLayout({
            bindGroupLayouts: [
                this.device.createBindGroupLayout({
                    entries: [{
                        binding: 0,
                        visibility: GPUShaderStage.VERTEX,
                        buffer: {
                            type: "uniform"
                        }
                    }]
                })
            ]
        });

        const pipeline = this.device.createRenderPipeline({
            layout,
            vertex: {
                module: shaderModule,
                entryPoint: "main",
                buffers: [{
                    arrayStride: 3 * Float32Array.BYTES_PER_ELEMENT,
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: "float32x3" }
                    ]
                }]
            },
            fragment: {
                module: shaderModule,
                entryPoint: "frag_main",
                targets: [{
                    format: this.format
                }]
            },
            primitive: {
                topology: "triangle-list"
            }
        });

        const commandEncoder = this.device.createCommandEncoder();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
                loadOp: "clear",
                storeOp: "store"
            }]
        });

        renderPass.setPipeline(pipeline);
        renderPass.setBindGroup(0, this.device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0,
                resource: {
                    buffer: this.TEMP_cameraBuffer!,
                    offset: 0,
                    size: 64
                }
            }]
        }));
        renderPass.setVertexBuffer(0, this.registry.getBuffer("vertex"));
        renderPass.setIndexBuffer(this.registry.getBuffer("index"), "uint16");

        let sceneCursor = 0;
        while (sceneCursor < this.sceneBufferCursor) {
            const _bufferMask = this.sceneBuffer[sceneCursor]; // TODO: use bufferMask to conditionally bind normal/uv buffers
            sceneCursor++;
            const vertexInfo = {
                addr: this.sceneBuffer[sceneCursor],
                count: this.sceneBuffer[sceneCursor + 1]
            };
            sceneCursor += 2;
            const indexInfo = {
                addr: this.sceneBuffer[sceneCursor],
                count: this.sceneBuffer[sceneCursor + 1]
            };
            sceneCursor += 2;

            renderPass.drawIndexed(indexInfo.count / 2, 1, indexInfo.addr / 2, vertexInfo.addr / 12, 0);
        }


        renderPass.end();
        this.device.queue.submit([commandEncoder.finish()]);
    }

    verifyReadyState(): asserts this is this & {
        adapter: GPUAdapter;
        device: GPUDevice;
        context: GPUCanvasContext;
        format: GPUTextureFormat;
        registry: ResourceRegistry;
        sceneBuffer: Uint32Array;
    } {
        if (!this.adapter) {
            throw new Error("WebGPU Adapter is not initialized.");
        }

        if (!this.device) {
            throw new Error("WebGPU Device is not initialized.");
        }

        if (!this.context) {
            throw new Error("WebGPU Context is not initialized.");
        }

        if (!this.format) {
            throw new Error("WebGPU Format is not initialized.");
        }

        if (!this.registry) {
            throw new Error("WebGPU Resource Registry is not initialized.");
        }
    }
}