export class RenderGraph {
    passes: Array<RenderPass | ComputePass> = []

    render(commandEncoder: GPUCommandEncoder) {
        for (let i = 0; i < this.passes.length; i++) {
            const pass = this.passes[i];
            if (pass instanceof RenderPass) {
                this._runRenderPass(pass);
            } else if (pass instanceof ComputePass) {
                this._runComputePass(pass);
            }
        }
    }

    private _runRenderPass(pass: RenderPass) {

    }

    private _runComputePass(pass: ComputePass) {

    }
}
export class RenderPass {
    bindGroups: number[] = []
    pipeline: GPURenderPipeline

    /**
     *
     */
    constructor(pipeline: GPURenderPipeline) {
        
        
    }
}

export class ComputePass {
bindGroups: number[] = []
}

export class BindGroupManager {

}