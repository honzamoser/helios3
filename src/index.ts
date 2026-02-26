/// <reference types="@webgpu/types" />

import { Renderer } from "./renderer";
import { createCube } from "./primitive";
import { quat, vec3 } from "wgpu-matrix";

const canvas = document.getElementById("screen") as HTMLCanvasElement;

const renderer = new Renderer(canvas);
renderer.initalize().then(() => {
    console.log("Renderer initialized successfully.");

    const cube = createCube();
    const cubeMeshHadnle = renderer.registerMesh(cube.vertices, cube.indices, cube.normals);

    const sceneObject = renderer.Scene.addObject(cubeMeshHadnle, 0, vec3.create(0, 0, 0), quat.fromEuler(0, 45, 0, "xyz"), vec3.create(0.5, 0.5, 0.5));

    renderer.render();
})