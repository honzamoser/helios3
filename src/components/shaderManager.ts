import { Renderer } from "../renderer";
import { Material, MaterialDescriptor } from "./material";
import { PipelineCache } from "./pipelineCache";
import { Shader, ShaderVariantFlags } from "./shader";

/**
 * Central manager for the material-shader-pipeline system.
 *
 * Responsibilities:
 *  1. Store registered Shaders and Materials.
 *  2. Own the three standardised bind group layouts:
 *       group 0 — global uniforms  (viewProjection, cameraPos, time)
 *       group 1 — material          (albedo, emissive, roughness, metallic)
 *       group 2 — per-object        (model matrix)
 *  3. Provide a PipelineCache that deduplicates GPURenderPipeline objects.
 *  4. Compile shader variants and create / cache material bind groups.
 */
export class ShaderManager {
    shaderStorage: Array<Shader> = [];
    materialStorage: Array<Material> = [];

    pipelineCache: PipelineCache | null = null;

    // Standardised bind group layouts
    globalBindGroupLayout: GPUBindGroupLayout | null = null;       // group 0
    materialBindGroupLayout: GPUBindGroupLayout | null = null;     // group 1
    perObjectBindGroupLayout: GPUBindGroupLayout | null = null;    // group 2

    /** The pipeline layout shared by all standard render pipelines. */
    pipelineLayout: GPUPipelineLayout | null = null;

    // ── Registration (call before setup) ────────────────────────────────

    /** Register a shader from WGSL source code. Returns the shader index. */
    registerShader(code: string): number {
        const shader = new Shader(code);
        this.shaderStorage.push(shader);
        return this.shaderStorage.length - 1;
    }

    /** Register a material. Returns the material index. */
    registerMaterial(descriptor: MaterialDescriptor): number {
        if (descriptor.shaderIndex < 0 || descriptor.shaderIndex >= this.shaderStorage.length) {
            throw new Error(`Invalid shader index: ${descriptor.shaderIndex}. Register the shader first.`);
        }
        const material = new Material(descriptor);
        this.materialStorage.push(material);
        return this.materialStorage.length - 1;
    }

    // ── Accessors ───────────────────────────────────────────────────────

    getShader(index: number): Shader {
        if (index < 0 || index >= this.shaderStorage.length) {
            throw new Error(`Invalid shader index: ${index}`);
        }
        return this.shaderStorage[index];
    }

    getMaterial(index: number): Material {
        if (index < 0 || index >= this.materialStorage.length) {
            throw new Error(`Invalid material index: ${index}`);
        }
        return this.materialStorage[index];
    }

    // ── Initialisation ──────────────────────────────────────────────────

    /**
     * Create bind group layouts, the shared pipeline layout, the pipeline
     * cache, and upload initial material uniform data.
     *
     * Must be called after all shaders and materials have been registered
     * and after the renderer has been initialised (GPU device available).
     */
    setup(renderer: Renderer) {
        renderer.checkReadyState();
        const device = renderer.GPUDevice;

        // Group 0 — global uniforms (viewProjection matrix)
        this.globalBindGroupLayout = device.createBindGroupLayout({
            label: "Global Bind Group Layout (group 0)",
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" },
            }],
        });

        // Group 1 — material uniforms (albedo, emissive, roughness, metallic)
        this.materialBindGroupLayout = device.createBindGroupLayout({
            label: "Material Bind Group Layout (group 1)",
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" },
            }],
        });

        // Group 2 — per-object uniforms (model matrix)
        this.perObjectBindGroupLayout = device.createBindGroupLayout({
            label: "Per-Object Bind Group Layout (group 2)",
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: { type: "uniform" },
            }],
        });

        // Shared pipeline layout
        this.pipelineLayout = device.createPipelineLayout({
            label: "Standard Pipeline Layout",
            bindGroupLayouts: [
                this.globalBindGroupLayout,
                this.materialBindGroupLayout,
                this.perObjectBindGroupLayout,
            ],
        });

        // Pipeline cache
        this.pipelineCache = new PipelineCache(device);

        // Upload all registered material uniforms
        for (const material of this.materialStorage) {
            material.uploadUniforms(device);
        }
    }

    // ── Pipeline / bind-group helpers ────────────────────────────────────

    /**
     * Get (or create) a render pipeline matching the given material and
     * vertex layout.
     */
    getPipeline(
        materialIndex: number,
        vertexLayout: string,
        format: GPUTextureFormat,
        depthFormat?: GPUTextureFormat,
    ): GPURenderPipeline {
        if (!this.pipelineCache || !this.pipelineLayout) {
            throw new Error("ShaderManager not initialised — call setup() first.");
        }

        const material = this.getMaterial(materialIndex);
        const shader = this.getShader(material.shaderIndex);

        return this.pipelineCache.getOrCreate({
            shader,
            shaderFlags: material.flags,
            vertexLayout,
            format,
            depthFormat,
            pipelineLayout: this.pipelineLayout,
        });
    }

    /** Return the material bind group for a given material index. */
    getMaterialBindGroup(materialIndex: number, device: GPUDevice): GPUBindGroup {
        if (!this.materialBindGroupLayout) {
            throw new Error("ShaderManager not initialised — call setup() first.");
        }
        const material = this.getMaterial(materialIndex);
        return material.getBindGroup(device, this.materialBindGroupLayout);
    }
}

// Re-export descriptor type for convenience
export type { MaterialDescriptor } from "./material";
