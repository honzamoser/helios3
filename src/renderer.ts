import { mat4, vec3 } from "wgpu-matrix";
import { Camera } from "./components/camera";
import { MeshRegistry } from "./components/meshRegistry";
import { RenderState } from "./components/renderState";
import { UniformBuffer } from "./components/uniformBuffer";


export class Renderer {
    public canvas: HTMLCanvasElement;

    GPUAdapter: GPUAdapter | null = null;
    GPUDevice: GPUDevice | null = null;
    GPUContext: GPUCanvasContext | null = null;
    GPUFormat: GPUTextureFormat = "bgra8unorm";

    MeshRegistry: MeshRegistry | null = null;
    Scene: RenderState = new RenderState();
    Camera: Camera;

    UniformBuffer: UniformBuffer | null = null;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.Camera = new Camera(vec3.create(0, 0, -5), vec3.create(0, 0, 0), degToRad(90),
            this.canvas.width / this.canvas.height);
    }

    public async initalize() {
        if (!navigator.gpu) {
            throw new Error("WebGPU is not supported in this browser.");
        }

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            throw new Error("Failed to get GPU adapter.");
        }
        this.GPUAdapter = adapter;

        const device = await adapter.requestDevice();
        if (!device) {
            throw new Error("Failed to get GPU device.");
        }
        this.GPUDevice = device;

        const context = this.canvas.getContext("webgpu");
        if (!context) {
            throw new Error("Failed to get WebGPU context.");
        }
        this.GPUContext = context;
        this.GPUFormat = navigator.gpu.getPreferredCanvasFormat();

        this.GPUContext.configure({
            device: this.GPUDevice,
            format: this.GPUFormat,
            alphaMode: "premultiplied"
        });

        // ---

        this.MeshRegistry = new MeshRegistry(this.GPUDevice);
        this.MeshRegistry.initialize();

        this.UniformBuffer = new UniformBuffer(this.GPUDevice, this.Camera.viewMatrix);
    }

    registerMesh(vertexData: Float32Array, indexData: Uint16Array, normalData?: Float32Array, uv0Data?: Float32Array): number {
        if (!this.MeshRegistry) {
            throw new Error("MeshRegistry is not initialized.");
        }

        return this.MeshRegistry.registerMesh(vertexData, indexData, normalData, uv0Data);
    }



    public render() {
        // Temporarily hard coded 3D rendering logic
        // To be replaced with render graph

        // Ensures that all the dependencies are initialized before rendering
        this.checkReadyState();

        // Temporary camera buffer data (4x4 view-projection matrix)

        

        // Create depth texture for proper depth testing
        const depthTexture = this.GPUDevice.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });



        const shaderModule = this.GPUDevice.createShaderModule({
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
            
            return vec4<f32>(fragPosition.x * 2, fragPosition.y * 2, fragPosition.z * 2, 1.0);
        }
        `
        });

        const layout = this.GPUDevice.createPipelineLayout({
            bindGroupLayouts: [
                this.GPUDevice.createBindGroupLayout({
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

        const pipeline = this.GPUDevice.createRenderPipeline({
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
                    format: this.GPUFormat
                }]
            },
            primitive: {
                topology: "triangle-list"
            },
            depthStencil: {
                format: "depth24plus",
                depthWriteEnabled: true,
                depthCompare: "less",
            }
        });

        const bg = this.GPUDevice.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0,
                resource: {
                    buffer: this.UniformBuffer.buffer!,
                    offset: 0,
                    size: 64
                }
            }]
        })

        let frame = () => {

            mat4.rotateY(this.Scene.scene[0].matrix, 0.01, this.Scene.scene[0].matrix);
            mat4.rotateX(this.Scene.scene[0].matrix, 0.02, this.Scene.scene[0].matrix);
            mat4.rotateZ(this.Scene.scene[0].matrix, 0.04, this.Scene.scene[0].matrix);
            this.UniformBuffer.viewProjectionMatrix = mat4.mul(this.Camera.viewMatrix, this.Scene.scene[0].matrix);

            const commandEncoder = this.GPUDevice.createCommandEncoder();
            const renderPass = commandEncoder.beginRenderPass({
                colorAttachments: [{
                    view: this.GPUContext.getCurrentTexture().createView(),
                    clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
                    loadOp: "clear",
                    storeOp: "store"
                }],
                depthStencilAttachment: {
                    view: depthTexture.createView(),
                    depthClearValue: 1.0,
                    depthLoadOp: "clear",
                    depthStoreOp: "store",
                }
            });

            renderPass.setPipeline(pipeline);
            renderPass.setBindGroup(0, bg);


            renderPass.setVertexBuffer(0, this.MeshRegistry.vertexBuffer);
            renderPass.setIndexBuffer(this.MeshRegistry.indexBuffer, "uint16");

            for (const object of this.Scene.scene) {
                const mesh = this.MeshRegistry.getMeshData(object.meshHandle);
                if (!mesh) continue;

                // TODO: The offset and size values are inverted
                renderPass.drawIndexed(mesh.indexOffset, 1, 0, 0, 0);
            }

            renderPass.end();
            this.GPUDevice.queue.submit([commandEncoder.finish()]);

            requestAnimationFrame(frame.bind(this));
        }

        requestAnimationFrame(frame.bind(this));
    }

    checkReadyState(): asserts this is this & {
        GPUAdapter: GPUAdapter;
        GPUDevice: GPUDevice;
        GPUContext: GPUCanvasContext;
        MeshRegistry: MeshRegistry;
        UniformBuffer: UniformBuffer;
    } {
        let errors = [];

        if (!this.GPUAdapter) errors.push("GPUAdapter not initialized.");
        if (!this.GPUDevice) errors.push("GPUDevice not initialized.");
        if (!this.GPUContext) errors.push("GPUContext not initialized.");
        if (!this.MeshRegistry) errors.push("MeshRegistry not initialized.");
        if (!this.UniformBuffer) errors.push("UniformBuffer not initialized.");

        if (errors.length > 0) {
            throw new Error("Renderer is not ready: " + errors.join(" "));
        }
    }
}

function degToRad(degrees: number): number {
    return degrees * (Math.PI / 180);
}