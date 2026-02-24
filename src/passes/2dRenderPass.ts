import { RenderPass, RenderPassBuilder, ResourceRegistry } from "../renderGraph"

export class RenderPass2D implements RenderPass {
    pipeline: GPURenderPipeline;

    /**
     *
     */
    constructor(device: GPUDevice, format: GPUTextureFormat = "bgra8unorm") {
        const shaderModule = device.createShaderModule({
            code: `@vertex
fn main(@location(0) position: vec3<f32>) -> @builtin(position) vec4<f32> {
    return vec4<f32>(position, 1.0);
}
    
@fragment
fn frag_main() -> @location(0) vec4<f32> {
    return vec4<f32>(1.0, 0.0, 0.0, 1.0);
}`
        });

        this.pipeline = device.createRenderPipeline({
            layout: "auto",
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
                    format: format
                }]
            },
            primitive: {
                topology: "triangle-list"
            }
        });

    }

    setup(builder: RenderPassBuilder): void {

    }

    execute(encoder: GPUCommandEncoder, registry: ResourceRegistry): void {
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: registry.getSwapChain().createView(),
                loadOp: "clear",
                storeOp: "store",
                clearValue: { r: 0, g: 0, b: 0, a: 1 }
            }]
        });

        pass.setPipeline(this.pipeline);
        pass.setVertexBuffer(0, registry.getBuffer("vertex"));
        pass.setIndexBuffer(registry.getBuffer("index"), "uint16");

        pass.drawIndexed(6, 1, 0, 0, 0);

        pass.end();

    }
}