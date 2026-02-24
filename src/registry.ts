export class ResourceRegistry {
    device: GPUDevice;
    context: GPUCanvasContext;

    buffers: Map<string, {
        buffer: GPUBuffer,
        length: number
        cursor: number
    }> = new Map();

    

    declareBuffer(name: string, descriptor: GPUBufferDescriptor) {
        if (this.buffers.has(name)) {
            throw new Error(`Buffer ${name} is already declared.`);
        }

        const buffer = this.device.createBuffer(descriptor);
        this.buffers.set(name, {
            buffer: buffer,
            length: descriptor.size,
            cursor: 0
        });
    }

    getBuffer(name: string): GPUBuffer {
        const entry = this.buffers.get(name);
        if (!entry) {
            throw new Error(`Buffer ${name} is not declared.`);
        }
        return entry.buffer;
    }

    getCursor(name: string): number {
        const entry = this.buffers.get(name);
        if (!entry) {
            throw new Error(`Buffer ${name} is not declared.`);
        }
        return entry.cursor;
    }

    setCursor(name: string, cursor: number) {
        const entry = this.buffers.get(name);
        if (!entry) {
            throw new Error(`Buffer ${name} is not declared.`);
        }
        entry.cursor = cursor;
    }

    getSwapChain() {
        return this.context.getCurrentTexture();
    }

    constructor(device: GPUDevice, context: GPUCanvasContext) {
        this.device = device;
        this.context = context;
    }
}