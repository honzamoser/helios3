/// <reference types="@webgpu/types" />

import { Renderer } from "./renderer";
import { createCube } from "./primitive";
import { quat, vec3 } from "wgpu-matrix";
import { DEFAULT_LIT_SHADER } from "./shaders/defaultLit";

const canvas = document.getElementById("screen") as HTMLCanvasElement;

const renderer = new Renderer(canvas);
renderer.initalize().then(() => {
    console.log("Renderer initialized successfully.");

    // ── Register shader & materials ──────────────────────────────────
    const defaultShaderIndex = renderer.ShaderManager.registerShader(DEFAULT_LIT_SHADER);

    const redMaterial = renderer.ShaderManager.registerMaterial({
        shaderIndex: defaultShaderIndex,
        albedo: [1.0, 0.4, 0.4, 1.0],
        roughness: 0.5,
        metallic: 0.0,
    });

    // Initialise the material-shader system (bind group layouts, pipeline cache)
    renderer.ShaderManager.setup(renderer);

    // Setup the render pass (needs ShaderManager to be ready)
    renderer.pass.setup(renderer);

    // ── Scene ────────────────────────────────────────────────────────
    const cube = createCube();
    const cubeMeshHandle = renderer.registerMesh(cube.vertices, cube.indices, cube.normals);

    renderer.Scene.addObject(
        cubeMeshHandle,
        redMaterial,
        vec3.create(0, 0, 0),
        quat.fromEuler(0, 45, 0, "xyz"),
        vec3.create(0.5, 0.5, 0.5),
    );

    renderer.render();
})