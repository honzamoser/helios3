import { Shader, ShaderVariantFlags } from "./shader";

export interface VertexLayout {
    buffers: GPUVertexBufferLayout[];
    key: string;
}

/**
 * Predefined vertex buffer layouts matching common mesh configurations.
 * These correspond to the buffer types in MeshRegistry (vertex, normal, uv0).
 */
export const VERTEX_LAYOUTS: Record<string, VertexLayout> = {
    "position": {
        key: "position",
        buffers: [{
            arrayStride: 3 * Float32Array.BYTES_PER_ELEMENT,
            attributes: [
                { shaderLocation: 0, offset: 0, format: "float32x3" as GPUVertexFormat },
            ],
        }],
    },
    "position_normal": {
        key: "position_normal",
        buffers: [
            {
                arrayStride: 3 * Float32Array.BYTES_PER_ELEMENT,
                attributes: [
                    { shaderLocation: 0, offset: 0, format: "float32x3" as GPUVertexFormat },
                ],
            },
            {
                arrayStride: 3 * Float32Array.BYTES_PER_ELEMENT,
                attributes: [
                    { shaderLocation: 1, offset: 0, format: "float32x3" as GPUVertexFormat },
                ],
            },
        ],
    },
    "position_normal_uv": {
        key: "position_normal_uv",
        buffers: [
            {
                arrayStride: 3 * Float32Array.BYTES_PER_ELEMENT,
                attributes: [
                    { shaderLocation: 0, offset: 0, format: "float32x3" as GPUVertexFormat },
                ],
            },
            {
                arrayStride: 3 * Float32Array.BYTES_PER_ELEMENT,
                attributes: [
                    { shaderLocation: 1, offset: 0, format: "float32x3" as GPUVertexFormat },
                ],
            },
            {
                arrayStride: 2 * Float32Array.BYTES_PER_ELEMENT,
                attributes: [
                    { shaderLocation: 2, offset: 0, format: "float32x2" as GPUVertexFormat },
                ],
            },
        ],
    },
};

export interface PipelineDescriptor {
    shader: Shader;
    shaderFlags: ShaderVariantFlags;
    vertexLayout: string;
    format: GPUTextureFormat;
    depthFormat?: GPUTextureFormat;
    depthWriteEnabled?: boolean;
    depthCompare?: GPUCompareFunction;
    cullMode?: GPUCullMode;
    topology?: GPUPrimitiveTopology;
    blendMode?: "opaque" | "alpha";
    pipelineLayout: GPUPipelineLayout;
}

/**
 * Caches GPURenderPipeline objects by a composite key derived from all
 * pipeline-affecting parameters. Avoids redundant pipeline creation when
 * multiple materials share the same configuration.
 */
export class PipelineCache {
    private cache: Map<string, GPURenderPipeline> = new Map();
    private device: GPUDevice;

    constructor(device: GPUDevice) {
        this.device = device;
    }

    private buildKey(desc: PipelineDescriptor): string {
        return [
            `shader:${desc.shader.getVariantKey(desc.shaderFlags)}`,
            `vtx:${desc.vertexLayout}`,
            `fmt:${desc.format}`,
            `depth:${desc.depthFormat ?? "none"}`,
            `dw:${desc.depthWriteEnabled ?? true}`,
            `dc:${desc.depthCompare ?? "less"}`,
            `cull:${desc.cullMode ?? "none"}`,
            `topo:${desc.topology ?? "triangle-list"}`,
            `blend:${desc.blendMode ?? "opaque"}`,
        ].join("|");
    }

    /**
     * Return a cached pipeline or create a new one from the descriptor.
     */
    getOrCreate(desc: PipelineDescriptor): GPURenderPipeline {
        const key = this.buildKey(desc);

        if (this.cache.has(key)) {
            return this.cache.get(key)!;
        }

        const layout = VERTEX_LAYOUTS[desc.vertexLayout];
        if (!layout) {
            throw new Error(`Unknown vertex layout: ${desc.vertexLayout}`);
        }

        const shaderModule = desc.shader.getModule(this.device, desc.shaderFlags);

        const blendState: GPUBlendState | undefined =
            desc.blendMode === "alpha"
                ? {
                    color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
                    alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
                }
                : undefined;

        const pipelineDescriptor: GPURenderPipelineDescriptor = {
            layout: desc.pipelineLayout,
            vertex: {
                module: shaderModule,
                entryPoint: "main",
                buffers: layout.buffers,
            },
            fragment: {
                module: shaderModule,
                entryPoint: "frag_main",
                targets: [{ format: desc.format, blend: blendState }],
            },
            primitive: {
                topology: desc.topology ?? "triangle-list",
                cullMode: desc.cullMode ?? "none",
            },
        };

        if (desc.depthFormat) {
            pipelineDescriptor.depthStencil = {
                format: desc.depthFormat,
                depthWriteEnabled: desc.depthWriteEnabled ?? true,
                depthCompare: desc.depthCompare ?? "less",
            };
        }

        const pipeline = this.device.createRenderPipeline(pipelineDescriptor);
        this.cache.set(key, pipeline);

        console.debug(`[PipelineCache] Created pipeline: ${key}`);
        return pipeline;
    }

    clear() {
        this.cache.clear();
    }

    get size(): number {
        return this.cache.size;
    }
}
