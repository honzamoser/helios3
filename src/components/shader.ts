import { Renderer } from "../renderer";

export type ShaderVariantFlags = Record<string, boolean>;

/**
 * Wraps WGSL source code with support for:
 * - #ifdef / #ifndef / #else / #endif preprocessing directives
 * - Variant-keyed GPUShaderModule caching
 *
 * Different combinations of variant flags produce different compiled modules,
 * all cached by their canonical key so each variant is compiled only once.
 */
export class Shader {
    code: string;
    private moduleCache: Map<string, GPUShaderModule> = new Map();

    constructor(code: string) {
        this.code = code;
    }

    // ── Preprocessing ───────────────────────────────────────────────────

    /**
     * Resolve #ifdef / #ifndef / #else / #endif directives in the shader
     * source code according to the supplied flags.
     */
    preprocess(flags: ShaderVariantFlags): string {
        const lines = this.code.split("\n");
        const output: string[] = [];
        const stack: boolean[] = [];

        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed.startsWith("#ifdef ")) {
                const flag = trimmed.substring(7).trim();
                stack.push(!!flags[flag]);
                continue;
            }

            if (trimmed.startsWith("#ifndef ")) {
                const flag = trimmed.substring(8).trim();
                stack.push(!flags[flag]);
                continue;
            }

            if (trimmed === "#else") {
                if (stack.length === 0) throw new Error("Shader preprocessor: #else without matching #ifdef");
                stack[stack.length - 1] = !stack[stack.length - 1];
                continue;
            }

            if (trimmed === "#endif") {
                if (stack.length === 0) throw new Error("Shader preprocessor: #endif without matching #ifdef");
                stack.pop();
                continue;
            }

            // Include line only when every condition on the stack is true
            if (stack.every((v) => v)) {
                output.push(line);
            }
        }

        if (stack.length > 0) {
            throw new Error("Shader preprocessor: unclosed #ifdef / #ifndef");
        }

        return output.join("\n");
    }

    // ── Module compilation & caching ────────────────────────────────────

    /**
     * Return a canonical string key for a set of variant flags.
     */
    getVariantKey(flags: ShaderVariantFlags): string {
        const active = Object.entries(flags)
            .filter(([_, v]) => v)
            .sort(([a], [b]) => a.localeCompare(b));
        return active.map(([k]) => k).join("|") || "__default__";
    }

    /**
     * Return a cached GPUShaderModule for the given variant, compiling it
     * on first access.
     */
    getModule(device: GPUDevice, flags: ShaderVariantFlags = {}): GPUShaderModule {
        const key = this.getVariantKey(flags);

        if (this.moduleCache.has(key)) {
            return this.moduleCache.get(key)!;
        }

        const processedCode = this.preprocess(flags);
        const module = device.createShaderModule({ code: processedCode });
        this.moduleCache.set(key, module);
        return module;
    }

    // ── Backward-compatible helpers ─────────────────────────────────────

    /**
     * Compile the default (no-flags) variant. Kept for backward compatibility.
     */
    setup(renderer: Renderer) {
        renderer.checkReadyState();
        this.getModule(renderer.GPUDevice);
    }

    /** Return the default variant module (or null if not yet compiled). */
    get shaderModule(): GPUShaderModule | null {
        return this.moduleCache.get("__default__") ?? null;
    }
}