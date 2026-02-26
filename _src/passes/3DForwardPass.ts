import { ResourceRegistry } from "../registry";
import { RenderPass, RenderPassBuilder } from "../renderGraph";

export class ForwardRenderPass3D implements RenderPass {
    constructor(device: GPUDevice, format: GPUTextureFormat = "bgra8unorm") {

    }

    setup(builder: RenderPassBuilder): void {
        
    }

    execute(encoder: GPUCommandEncoder, registry: ResourceRegistry): void {
        
    }
    
}