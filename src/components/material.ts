import { ShaderVariantFlags } from "./shader";

/**
 * Material uniform buffer layout (48 bytes, 16-byte aligned):
 *   albedo:   vec4<f32>  @ offset 0   (16 bytes)
 *   emissive: vec4<f32>  @ offset 16  (16 bytes, w unused)
 *   params:   vec4<f32>  @ offset 32  (x=roughness, y=metallic, zw unused)
 */
const MATERIAL_BUFFER_SIZE = 48;

export interface MaterialDescriptor {
    shaderIndex: number;
    albedo?: [number, number, number, number];
    roughness?: number;
    metallic?: number;
    emissive?: [number, number, number];
    flags?: ShaderVariantFlags;
}

export class Material {
    shaderIndex: number;

    albedo: Float32Array;
    roughness: number;
    metallic: number;
    emissive: Float32Array;

    flags: ShaderVariantFlags;

    // GPU resources
    uniformBuffer: GPUBuffer | null = null;
    bindGroup: GPUBindGroup | null = null;

    private _dirty: boolean = true;

    constructor(descriptor: MaterialDescriptor) {
        this.shaderIndex = descriptor.shaderIndex;
        this.albedo = new Float32Array(descriptor.albedo ?? [1, 1, 1, 1]);
        this.roughness = descriptor.roughness ?? 0.5;
        this.metallic = descriptor.metallic ?? 0.0;
        this.emissive = new Float32Array(descriptor.emissive ?? [0, 0, 0]);
        this.flags = descriptor.flags ?? {};
    }

    setAlbedo(r: number, g: number, b: number, a: number = 1.0) {
        this.albedo.set([r, g, b, a]);
        this._dirty = true;
        this.invalidateBindGroup();
    }

    setRoughness(value: number) {
        this.roughness = value;
        this._dirty = true;
        this.invalidateBindGroup();
    }

    setMetallic(value: number) {
        this.metallic = value;
        this._dirty = true;
        this.invalidateBindGroup();
    }

    setEmissive(r: number, g: number, b: number) {
        this.emissive.set([r, g, b]);
        this._dirty = true;
        this.invalidateBindGroup();
    }

    /**
     * Create or update the GPU uniform buffer with current material properties.
     */
    uploadUniforms(device: GPUDevice) {
        if (!this.uniformBuffer) {
            this.uniformBuffer = device.createBuffer({
                size: MATERIAL_BUFFER_SIZE,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                label: "Material Uniform Buffer",
            });
        }

        if (this._dirty) {
            const data = new Float32Array(12); // 48 bytes / 4 = 12 floats
            // albedo (vec4)
            data[0] = this.albedo[0];
            data[1] = this.albedo[1];
            data[2] = this.albedo[2];
            data[3] = this.albedo[3];
            // emissive (vec4, w unused)
            data[4] = this.emissive[0];
            data[5] = this.emissive[1];
            data[6] = this.emissive[2];
            data[7] = 0;
            // params (vec4: roughness, metallic, unused, unused)
            data[8] = this.roughness;
            data[9] = this.metallic;
            data[10] = 0;
            data[11] = 0;

            device.queue.writeBuffer(this.uniformBuffer, 0, data.buffer);
            this._dirty = false;
        }
    }

    /**
     * Create or return cached bind group for this material.
     */
    getBindGroup(device: GPUDevice, layout: GPUBindGroupLayout): GPUBindGroup {
        this.uploadUniforms(device);

        if (!this.bindGroup) {
            this.bindGroup = device.createBindGroup({
                layout: layout,
                entries: [{
                    binding: 0,
                    resource: {
                        buffer: this.uniformBuffer!,
                        offset: 0,
                        size: MATERIAL_BUFFER_SIZE,
                    }
                }],
                label: "Material Bind Group",
            });
        }

        return this.bindGroup;
    }

    /**
     * Invalidate cached bind group (call when properties change or layout changes).
     */
    invalidateBindGroup() {
        this.bindGroup = null;
    }

    /**
     * Get a unique pipeline key for this material's configuration.
     */
    getPipelineKey(): string {
        const flagPart = Object.entries(this.flags)
            .filter(([_, v]) => v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k]) => k)
            .join("|");
        return `shader:${this.shaderIndex}|flags:${flagPart || "none"}`;
    }
}
