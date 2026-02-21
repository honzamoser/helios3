import { RenderGraph } from "./renderGraph";



export class Renderer {
    adapterConfig: GPURequestAdapterOptions = {
        powerPreference: 'high-performance'
    }

    renderGraph: RenderGraph | undefined;

    adapter: GPUAdapter | undefined;
    device: GPUDevice | undefined;

    render() {
        if(!this.renderGraph) {
            throw new Error("The render graph has not been initialized.")
        }

        this.renderGraph.render();
    }

    public async initialize() {
        if(!navigator.gpu) {
            throw new Error("WebGPU is not supported in this browser.");
        }

        const adapter = await navigator.gpu.requestAdapter(this.adapterConfig);
        if(!adapter) {
            throw new Error("Failed to create WebGPU Adapter.")
        }
        this.adapter = adapter;

        this.device = await this.adapter.requestDevice();

        this.device.addEventListener("uncapturederror", e => {
            throw new Error("Uncaptured WebGPU Device error: " + e.error.message, {cause: e.error})
        })

        

    }
}