/// <reference types="@webgpu/types" />

import { Renderer } from "./renderer";

const devMode = true;

if (devMode) {
    const renderer = new Renderer();

    await renderer.initialize(document.getElementById("screen") as HTMLCanvasElement);
    // renderer.t_renderTriangle()



    // square
    renderer.uploadMesh({
        vertices: new Float32Array([
            -0.5, 0.5, 0.0,
            0.5, 0.5, 0.0,
            0.5, -0.5, 0.0,
            -0.5, -0.5, 0.0
        ]),
        indices: new Uint16Array([0, 1, 2, 2, 0, 3])
    })

    //triangle
    renderer.uploadMesh({
        vertices: new Float32Array([
            0.0, 1, 0.0,
            -0.5, -0.5, 0.0,
            0.5, -0.5, 0.0
        ]),
        indices: new Uint16Array([0, 1, 2])
     })

    // renderer.t_renderTriangle();
    renderer.render()
}
