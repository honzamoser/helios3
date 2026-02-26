import { ResourceRegistry } from "./registry";

export class RenderGraph {
    passes: Array<RenderPass> = []
    registry: ResourceRegistry;

    compile() {
        for (let i = 0; i < this.passes.length; i++) {
            const pass = this.passes[i];
            
        }
    }

    render(commandEncoder: GPUCommandEncoder) {
        for (let i = 0; i < this.passes.length; i++) {
            const pass = this.passes[i];

            this._runRenderPass(pass, commandEncoder);

        }
    }

    private _runRenderPass(pass: RenderPass, commandEncoder: GPUCommandEncoder) {
        pass.execute(commandEncoder, this.registry);
    }

    constructor(registry: ResourceRegistry) {
        this.registry = registry;
    }
}

export class RenderPassBuilder {
    passName: string | undefined;

    textures: Map<string, {
        param: GPUTextureDescriptor,
        usage: Map<string, string[]>
    }> = new Map();

    buffers: Map<string, {
        param: GPUBufferDescriptor,
        usage: Map<string, string[]>
    }> = new Map();

    pass(name: string) {
        this.passName = name;
        return this;
    }

    declareTexture(name: string, params: GPUTextureDescriptor) {
        const usage = new Map();
        usage.set(this.passName, ["declare"])

        this.textures.set(name, {
            param: params,
            usage: usage
        });
    }

    writeTexture(name: string) {
        const texture = this.textures.get(name);
        if (!texture) {
            throw new Error(`Texture ${name} is not declared.`);
        }

        const usage = texture.usage.get(this.passName) || [];
        usage.push("write");
        texture.usage.set(this.passName!, usage);
    }

    readTexture(name: string) {
        const texture = this.textures.get(name);
        if (!texture) {
            throw new Error(`Texture ${name} is not declared.`);
        }

        const usage = texture.usage.get(this.passName) || [];
        usage.push("read");
        texture.usage.set(this.passName!, usage);
    }


}





export interface RenderPass {
    setup(builder: RenderPassBuilder): void;
    execute(encoder: GPUCommandEncoder, registry: ResourceRegistry): void;
}