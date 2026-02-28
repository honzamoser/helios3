import { mat4, vec3 } from "wgpu-matrix";
import { Camera } from "./components/camera";
import { MeshRegistry } from "./components/meshRegistry";
import { RenderState } from "./components/renderState";
import { ShaderManager } from "./components/shaderManager";
import { UniformBuffer } from "./components/uniformBuffer";
import { RenderPass3D } from "./passes/3DRenderPass";


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
    ShaderManager: ShaderManager = new ShaderManager();

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.Camera = new Camera(vec3.create(0, 0, -5), vec3.create(0, 0, 0), degToRad(90),
            this.canvas.width / this.canvas.height);
    }

    public async initalize(): Promise<void> {
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

    pass = new RenderPass3D();

    public render(): void {

        let frame = () => {

            this.pass.execute(this);

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