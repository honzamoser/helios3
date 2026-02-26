import { Mat4 } from "wgpu-matrix";


// TODO: Smarter system of assigning to the uniform buffer
export class UniformBuffer {

    GPUDevice: GPUDevice;
    buffer: GPUBuffer;

    set viewProjectionMatrix(matrix: Float32Array) {
        this.GPUDevice.queue.writeBuffer(this.buffer, 0, matrix.buffer, matrix.byteOffset, matrix.byteLength);
    }   

    constructor(device: GPUDevice, initialMatrix: Mat4) {
        this.GPUDevice = device;

        this.buffer = this.GPUDevice.createBuffer({
            size: 64, // 4x4 matrix of 32-bit floats
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
            label: "Uniform Buffer"
        });

        new Float32Array(this.buffer.getMappedRange()).set(new Float32Array([...initialMatrix]));
        this.buffer.unmap();
    }
}