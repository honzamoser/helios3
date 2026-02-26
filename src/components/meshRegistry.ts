const BUFFER_SIZES = {
    vertex: 1024 * 1024 * 1, // 10 MB
    index: 1024 * 1024 * 0.5,   // 5 MB
    normal: 1024 * 1024 * 1, // 10 MB
    uv0: 1024 * 1024 * 1,    // 10 MB
}

export class MeshRegistry {

    GPUDevice: GPUDevice;

    vertexBuffer: GPUBuffer | null = null;
    indexBuffer: GPUBuffer | null = null;
    normalBuffer: GPUBuffer | null = null;
    uv0Buffer: GPUBuffer | null = null;

    vertexCursor: number = 0;
    indexCursor: number = 0
    normalCursor: number = 0;
    uv0Cursor: number = 0;

    meshRegistry: Uint32Array = new Uint32Array(1024); // 4 KB for mesh registry
    meshRegistryCursor: number = 0;

    constructor(device: GPUDevice) {
        this.GPUDevice = device;
    }

    initialize() {
        this.vertexBuffer = this.GPUDevice.createBuffer({
            size: BUFFER_SIZES.vertex,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        this.indexBuffer = this.GPUDevice.createBuffer({
            size: BUFFER_SIZES.index,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });

        this.normalBuffer = this.GPUDevice.createBuffer({
            size: BUFFER_SIZES.normal,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        this.uv0Buffer = this.GPUDevice.createBuffer({
            size: BUFFER_SIZES.uv0,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
    }

    public registerMesh(vertexData: Float32Array, indexData: Uint16Array, normalData?: Float32Array, uv0Data?: Float32Array): number {
        // a registry mask defines if the mesh has normals and uv0 data
        let registryMask = 0b11; // Vertex and index are always present
        if (normalData) registryMask |= 0b100; // Set the normal bit
        if (uv0Data) registryMask |= 0b1000; // Set the uv0 bit

        const meshId = this.meshRegistryCursor;
        this.meshRegistry[meshId] = registryMask;
        this.meshRegistryCursor++;

        this.GPUDevice.queue.writeBuffer(this.vertexBuffer!, this.vertexCursor, vertexData.buffer);
        this.vertexCursor += vertexData.byteLength;

        this.GPUDevice.queue.writeBuffer(this.indexBuffer!, this.indexCursor, indexData.buffer);
        this.indexCursor += indexData.byteLength;

        if (normalData) {
            this.GPUDevice.queue.writeBuffer(this.normalBuffer!, this.normalCursor, normalData.buffer);
            this.normalCursor += normalData.byteLength;
        }

        if (uv0Data) {
            this.GPUDevice.queue.writeBuffer(this.uv0Buffer!, this.uv0Cursor, uv0Data.buffer);
            this.uv0Cursor += uv0Data.byteLength;
        }

        const meshData = [
            registryMask,
            this.vertexCursor - vertexData.byteLength, // vertex offset
            vertexData.byteLength, // vertex size
            this.indexCursor - indexData.byteLength, // index offset
            indexData.byteLength, // index size
        ]

        if (normalData) {
            meshData.push(this.normalCursor - normalData.byteLength);
            meshData.push(normalData.byteLength);
        }

        if (uv0Data) {
            meshData.push(this.uv0Cursor - uv0Data.byteLength);
            meshData.push(uv0Data.byteLength);
        }

        this.meshRegistry.set(meshData, this.meshRegistryCursor); // Each mesh entry takes 8 uint32 values
        this.meshRegistryCursor += meshData.length;

        console.debug(`Registered mesh ${meshId} with registry mask ${registryMask.toString(2).padStart(4, '0')}`);

        return meshId;
    }

    getMeshData(meshId: number) {
        const registryMask = this.meshRegistry[meshId];
        const hasNormal = (registryMask & 0b100) !== 0;
        const hasUV0 = (registryMask & 0b1000) !== 0;

        console.log(registryMask);
        

        return {
            vertexOffset: this.meshRegistry[meshId + 1],
            vertexSize: this.meshRegistry[meshId + 2],
            indexOffset: this.meshRegistry[meshId + 3],
            indexSize: this.meshRegistry[meshId + 4],
            normalOffset: hasNormal ? this.meshRegistry[meshId + 5] : null,
            normalSize: hasNormal ? this.meshRegistry[meshId + 6] : null,
            uv0Offset: hasUV0 ? this.meshRegistry[meshId + 7] : null,
            uv0Size: hasUV0 ? this.meshRegistry[meshId + 8] : null,
        }
    }
}