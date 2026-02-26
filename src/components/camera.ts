import { mat4, Vec3 } from "wgpu-matrix";

export class Camera {
    position: Vec3;
    rotation: Vec3;
    fov: number;
    aspectRatio: number;

    constructor(position: Vec3, rotation: Vec3, fov: number, aspectRatio: number) {
        this.position = position;
        this.rotation = rotation;
        this.fov = fov;
        this.aspectRatio = aspectRatio;
    }

    private _viewMatrix: Float32Array | null = null;
    get viewMatrix(): Float32Array {
        if (!this._viewMatrix) {
            this._viewMatrix = this.calculateViewMatrix();
        }
        return this._viewMatrix;
    }

    calculateViewMatrix(): Float32Array {
        const projection = mat4.perspective(this.fov, this.aspectRatio, 0.1, 1000.0);
        const view = mat4.lookAt([0, 0, 2], [0, 0, 0], [0, 1, 0]);
        // const view = mat4.create();
        // mat4.translate(view, this.position, view);
        // mat4.rotateX(view, this.rotation[0], view);
        // mat4.rotateY(view, this.rotation[1], view);
        // mat4.rotateZ(view, this.rotation[2], view);
        return mat4.mul(projection, view);
    }
}