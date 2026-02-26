import { mat4, Mat4, quat, Quat, Vec3 } from "wgpu-matrix";

export class RenderState {
    scene: RenderObject[] = [];

    /**
     * 
     * @param meshHandle The handle of the mesh to render
     * @param materialHandle The handle of the material to apply to the mesh
     * @param position Initial Vector3 position of the mesh
     * @param rotation Initial Quaternion rotation of the mesh
     * @param scale Initial Vector3 scale of the mesh
     * @returns The ID of the RenderObject
     */
    addObject(meshHandle: number, materialHandle: number, position: Vec3, rotation: Quat, scale: Vec3): number {
        return this.scene.push(new RenderObject(meshHandle, materialHandle, position, rotation, scale)) - 1;
    }
}

class RenderObject {
    meshHandle: number;
    materialHandle: number;

    position: Vec3;
    rotation: Quat;
    scale: Vec3;
    matrix: Mat4;

    constructor(meshHandle: number, materialHandle: number, position: Vec3, rotation: Quat, scale: Vec3) {
        this.meshHandle = meshHandle;
        this.materialHandle = materialHandle;
        this.position = position;
        this.rotation = rotation;
        this.scale = scale;

        const matrix = mat4.fromQuat(rotation);
        mat4.translate(matrix, position, matrix);
        mat4.scale(matrix, scale, matrix);
        this.matrix = matrix;

    }
}

function deg(degrees: number): number {
    return degrees * (Math.PI / 180);
}