import { mat4 } from "wgpu-matrix";
import { Renderer } from "../renderer";

/**
 * Forward 3D render pass that uses the material-shader system.
 *
 * Bind group convention:
 *   group 0 — global uniforms (viewProjection)
 *   group 1 — material        (albedo, emissive, params)
 *   group 2 — per-object      (model matrix)
 *
 * Objects are sorted by material before drawing to minimise pipeline /
 * bind-group switches.
 */
export class RenderPass3D {
    depthTexture: GPUTexture | null = null;
    globalBindGroup: GPUBindGroup | null = null;

    // Per-object model-matrix resources (grown lazily)
    private modelBuffers: GPUBuffer[] = [];
    private modelBindGroups: GPUBindGroup[] = [];

    setup(renderer: Renderer) {
        renderer.checkReadyState();

        this.depthTexture = renderer.GPUDevice.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });

        // Global bind group (group 0) — viewProjection uniform buffer
        const shaderMgr = renderer.ShaderManager;
        this.globalBindGroup = renderer.GPUDevice.createBindGroup({
            layout: shaderMgr.globalBindGroupLayout!,
            entries: [{
                binding: 0,
                resource: {
                    buffer: renderer.UniformBuffer.buffer,
                    offset: 0,
                    size: 64,
                },
            }],
            label: "Global Bind Group",
        });
    }

    /**
     * Ensure we have at least `count` per-object model-matrix buffers
     * and matching bind groups.
     */
    private ensureModelResources(renderer: Renderer, count: number) {
        renderer.checkReadyState();
        const device = renderer.GPUDevice;
        const layout = renderer.ShaderManager.perObjectBindGroupLayout!;

        while (this.modelBuffers.length < count) {
            const buffer = device.createBuffer({
                size: 64,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                label: `Model Matrix Buffer ${this.modelBuffers.length}`,
            });
            const bindGroup = device.createBindGroup({
                layout,
                entries: [{ binding: 0, resource: { buffer, offset: 0, size: 64 } }],
                label: `Model Bind Group ${this.modelBindGroups.length}`,
            });
            this.modelBuffers.push(buffer);
            this.modelBindGroups.push(bindGroup);
        }
    }

    execute(renderer: Renderer) {
        renderer.checkReadyState();
        const device = renderer.GPUDevice;
        const scene = renderer.Scene.scene;

        if (scene.length === 0) return;

        // Grow per-object GPU resources as needed
        this.ensureModelResources(renderer, scene.length);

        // Upload viewProjection matrix
        renderer.UniformBuffer.viewProjectionMatrix = renderer.Camera.viewMatrix;

        // Upload per-object model matrices
        for (let i = 0; i < scene.length; i++) {
            const obj = scene[i];
            // Keep the existing spinning animation
            mat4.rotateY(obj.matrix, 0.01, obj.matrix);
            mat4.rotateX(obj.matrix, 0.02, obj.matrix);
            mat4.rotateZ(obj.matrix, 0.04, obj.matrix);

            device.queue.writeBuffer(
                this.modelBuffers[i], 0,
                new Float32Array([...obj.matrix]),
            );
        }

        const commandEncoder = device.createCommandEncoder();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: renderer.GPUContext.getCurrentTexture().createView(),
                clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 },
                loadOp: "clear",
                storeOp: "store",
            }],
            depthStencilAttachment: {
                view: this.depthTexture!.createView(),
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        });

        // Shared vertex / index buffers
        renderPass.setVertexBuffer(0, renderer.MeshRegistry.vertexBuffer);
        renderPass.setIndexBuffer(renderer.MeshRegistry.indexBuffer!, "uint16");

        // Bind global uniforms (group 0)
        renderPass.setBindGroup(0, this.globalBindGroup!);

        // Sort objects by material to reduce pipeline / bind-group switches
        const sortedIndices = scene
            .map((_, i) => i)
            .sort((a, b) => scene[a].materialHandle - scene[b].materialHandle);

        let currentMaterial = -1;

        for (const objIndex of sortedIndices) {
            const obj = scene[objIndex];

            // Switch pipeline + material bind group when needed
            if (obj.materialHandle !== currentMaterial) {
                currentMaterial = obj.materialHandle;

                const pipeline = renderer.ShaderManager.getPipeline(
                    currentMaterial, "position", renderer.GPUFormat, "depth24plus",
                );
                renderPass.setPipeline(pipeline);

                const materialBindGroup = renderer.ShaderManager.getMaterialBindGroup(
                    currentMaterial, device,
                );
                renderPass.setBindGroup(1, materialBindGroup);
            }

            // Bind per-object model matrix (group 2)
            renderPass.setBindGroup(2, this.modelBindGroups[objIndex]);

            // Draw
            const mesh = renderer.MeshRegistry.getMeshData(obj.meshHandle);
            if (!mesh) continue;
            renderPass.drawIndexed(mesh.indexOffset, 1, 0, 0, 0);
        }

        renderPass.end();
        device.queue.submit([commandEncoder.finish()]);
    }
}