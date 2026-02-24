U

## Plan: Helios3 — Full PBR WebGPU Rendering Engine

A phased plan to evolve the current minimal WebGPU renderer into a full PBR engine with a render graph, material/pipeline system, shadow maps, environment maps, post-processing, and skeletal animation. The architecture uses a flat render-object list (no ECS), GPU frustum culling and MDI as **optional passes** (not defaults, due to browser support), and builds on the existing `RenderGraph` / `ResourceRegistry` / `RenderPass` patterns already established.

---

### Phase 1 — Foundation: Build System, Math, Camera, Depth

**Goal**: Get a perspective-projected, depth-tested, colored mesh on screen.

1. **Fix index format mismatch** — Change the four generators in primitive.ts to output `Uint16Array` to match the new renderer's `uint16` format, or make the renderer configurable. Standardize on one format across the codebase.

2. **Grow buffer sizes** — The 1024-byte buffers in renderer.ts (`declareBuffer` calls around line 40–50) are too small for real scenes. Make them configurable with sensible defaults (e.g., 4 MB vertex, 2 MB index, 2 MB normal, 2 MB UV).

3. **Create `src/math/` module** — Wrap `wgpu-matrix` with engine-specific helpers:
   - `src/math/index.ts` — re-export `mat4`, `vec3`, `vec4`, `quat` from `wgpu-matrix`
   - `src/math/transform.ts` — `Transform` class: `position: Vec3`, `rotation: Quat`, `scale: Vec3`, `getModelMatrix(): Mat4`, with dirty-flag caching
   - `src/math/frustum.ts` — `Frustum` class: extract 6 planes from a viewProj matrix, `testAABB(min, max): boolean`

4. **Create `src/camera.ts`** — `Camera` class:
   - `position`, `target` (or Euler angles), `fov`, `near`, `far`, `aspect`
   - `getViewMatrix()`, `getProjectionMatrix()`, `getViewProjectionMatrix()`
   - A `CameraController` helper for orbit / fly-style input (mouse + keyboard)
   - Reference: the legacy renderer's camera code in _renderer.ts (around the `camPos`, `camRot`, `viewMatrix`, `projMatrix` fields)

5. **Create uniform buffer system** — Add a **global uniform buffer** to the registry:
   - Struct layout: `viewProj (mat4x4)`, `cameraPos (vec3)`, `time (f32)`, pad to 256-byte alignment
   - Upload once per frame in the renderer's `render()` method before graph execution
   - Register as `"uniforms"` in `ResourceRegistry`

6. **Add depth buffer** — In the renderer, create a depth texture (`depth24plus`) matching canvas size, pass it to render passes via the registry (`getDepthTexture()` or declare it as a named texture). Wire `depthStencilAttachment` into 2dRenderPass.ts (which becomes the forward pass).

7. **Create a 3D forward render pass** — `src/passes/forwardPass.ts`:
   - Replace the hardcoded `drawIndexed(6)` in the current 2D pass with a loop over the scene buffer (like `t_renderTriangle()` does in renderer.ts around line 130–180)
   - Bind the uniform buffer at `@group(0) @binding(0)`
   - Use a basic WGSL shader with `viewProj * model * position` vertex transform
   - Add per-mesh model matrix via a storage buffer or dynamic uniform offset

---

### Phase 2 — Material, Shader & Pipeline System

**Goal**: Data-driven materials that map to cached GPU pipelines.

8. **Expand `Material` class** — Replace the stub in material.ts:
   - Properties: `albedo: Vec4`, `roughness: f32`, `metallic: f32`, `emissive: Vec3`, `albedoTexture?: Texture`, `normalTexture?: Texture`, `metallicRoughnessTexture?: Texture`
   - `getBindGroup(device, layout): GPUBindGroup` — creates/caches the bind group with textures + material uniform buffer
   - `getPipelineKey(): string` — returns a hash based on shader variant flags (has normal map, has emissive, alpha mode, etc.)

9. **Create `src/shader.ts` — Shader management system**:
   - `ShaderLibrary` class: loads `.wgsl` files, supports `#include`-style preprocessing for shared code (structs, lighting functions)
   - Shader variant system: define `#ifdef`-like flags (`HAS_NORMAL_MAP`, `HAS_EMISSIVE`, `ALPHA_CUTOFF`) resolved at compile time via string replacement or WGSL `override` constants
   - Cache compiled `GPUShaderModule` by variant key

10. **Create `src/pipeline.ts` — Pipeline cache**:
    - `PipelineCache` class: key = `shaderVariantKey + vertexLayout + blendMode + cullMode + depthWrite`
    - `getOrCreate(descriptor): GPURenderPipeline`
    - Vertex buffer layouts defined per mesh type (pos-only, pos+normal, pos+normal+uv, pos+normal+uv+tangent)
    - Bind group layouts: group 0 = global uniforms, group 1 = material, group 2 = per-object (model matrix), group 3 = reserved (shadows/env)

---

### Phase 3 — Mesh Upload & Scene Management

**Goal**: Robust mesh handling, scene object list, instancing.

11. **Create `src/mesh.ts` — Mesh class**:
    - Stores typed arrays: `vertices`, `indices`, `normals`, `uvs`, `tangents` (optional)
    - `computeTangents()` — MikkTSpace-style tangent generation from positions + normals + UVs
    - `computeAABB()` — bounding box for culling
    - Factory methods for primitives (delegates to primitive.ts)

12. **Refactor `uploadMesh()` in renderer.ts**:
    - Support all buffer types: vertex, index, normal, UV, tangent
    - Update `bufferMask` in the scene buffer to reflect which attributes are present
    - Return a `MeshHandle` (offset + sizes) so the caller can reference the uploaded data
    - Handle buffer overflow: auto-resize or error with clear message

13. **Create `src/renderObject.ts` — Flat render-object list**:
    - `RenderObject`: `{ meshHandle: MeshHandle, material: Material, transform: Transform, visible: boolean }`
    - `Scene` class: flat `RenderObject[]` array, methods to add/remove/query
    - Sort by material pipeline key before rendering (minimize state changes)
    - Per-object model matrix uploaded to a storage buffer indexed by draw ID

14. **Instancing support**:
    - `InstanceGroup`: shares a `MeshHandle` + `Material`, has a `Float32Array` of model matrices
    - Upload instance matrices to a storage buffer
    - Single `drawIndexed(indexCount, instanceCount)` per group

---

### Phase 4 — Lighting & Shading (PBR)

**Goal**: Physically-based rendering with multiple light types.

15. **Expand `Light` in light.ts**:
    - Add `Light.createSpot(position, direction, range, innerCone, outerCone)` factory
    - Add `castShadow: boolean`, `shadowMapIndex: number` fields
    - `LightManager` class: maintains a GPU storage buffer of packed light data (position, direction, color, intensity, range, type, shadowIndex), uploads once per frame
    - Max lights: configurable (e.g., 128), passed as uniform

16. **Write PBR WGSL shader library** — `src/shaders/pbr.wgsl`:
    - Shared structs: `Light`, `Material`, `VertexOutput`
    - BRDF functions: Cook-Torrance specular (GGX distribution, Smith geometry, Fresnel-Schlick), Lambertian diffuse
    - Punctual light evaluation: point, directional, spot with distance/angle attenuation
    - Tonemap: ACES filmic or Khronos PBR Neutral
    - Include hooks for shadow sampling and IBL (implemented in later phases)

17. **Update forward pass** to use PBR shader, bind light storage buffer at `@group(0) @binding(1)`, bind material at group 1.

---

### Phase 5 — Texturing

**Goal**: Load and bind albedo, normal, metallic-roughness, emissive, and AO textures.

18. **Create `src/texture.ts` — Texture management**:
    - `TextureManager` class registered in `ResourceRegistry`
    - `loadFromURL(url): Promise<GPUTexture>` — fetch image, create bitmap, copy to GPU, generate mipmaps
    - `loadFromData(data, width, height, format)` — for procedural or raw data
    - Mipmap generation: either via compute shader blits or `copyExternalImageToTexture` + successive blit passes
    - Sampler cache: key by filter mode + address mode + anisotropy

19. **Default textures**: 1x1 white (albedo default), 1x1 flat-normal (0.5, 0.5, 1.0), 1x1 black (emissive default) — avoids branching in shaders when textures are absent.

20. **Material bind group wiring**: In `Material.getBindGroup()`, bind albedo + normal + metallicRoughness + emissive + AO textures + sampler. If a texture slot is null, bind the corresponding default texture.

21. **Environment mapping** — `src/environment.ts`:
    - Load equirectangular HDR or cubemap faces
    - Generate prefiltered environment map (specular IBL) via compute shader
    - Generate irradiance map (diffuse IBL) via compute shader
    - Generate BRDF LUT (2D texture, Schlick/GGX integration)
    - Bind at `@group(3)` in the PBR shader for image-based lighting

---

### Phase 6 — Render Graph Completion

**Goal**: Make the render graph a true dependency-driven system.

22. **Implement `compile()` in renderGraph.ts**:
    - Topological sort passes based on read/write dependencies declared in `setup()`
    - Insert resource barriers / layout transitions between passes
    - Detect unused passes and prune them (dead-pass elimination)
    - Validate that no resource is written by two passes simultaneously

23. **Add buffer tracking to `RenderPassBuilder`** — currently only textures are tracked. Add `declareBuffer()`, `readBuffer()`, `writeBuffer()` mirroring the texture methods.

24. **Transient resource allocation** — for intermediate textures (e.g., shadow maps, GBuffer, post-process targets):
    - Pool-based allocation: reuse textures with matching format/size across non-overlapping passes
    - Created lazily during `compile()`, freed at frame end

---

### Phase 7 — Shadow Mapping

**Goal**: Directional and point/spot shadow maps.

25. **Create `src/passes/shadowPass.ts`**:
    - Depth-only render pass, one per shadow-casting light
    - Directional light: orthographic projection, fit to camera frustum (cascaded shadow maps — 2–4 cascades)
    - Spot light: single perspective shadow map
    - Point light: cubemap shadow map (6 faces or dual paraboloid)
    - Output: depth textures stored in a texture array, declared via the render graph

26. **Shadow sampling in PBR shader**:
    - PCF (percentage-closer filtering) with 3×3 or Poisson-disk kernel
    - Cascade selection for directional shadows (based on fragment depth)
    - Shadow bias: slope-scaled + constant
    - Bind shadow atlas/array at `@group(3) @binding(3)`

27. **Wire into render graph**: shadow passes execute before the forward pass, their depth textures are read-resources for the forward pass.

---

### Phase 8 — Post-Processing

**Goal**: HDR rendering with tone mapping, bloom, SSAO, FXAA.

28. **Switch to HDR render target** — change the forward pass color attachment from `bgra8unorm` (currently hardcoded in 2dRenderPass.ts) to `rgba16float`.

29. **Create `src/passes/bloomPass.ts`**:
    - Threshold bright pixels → downsample chain (5–8 mip levels) → upsample + blend
    - Compute-shader-based for efficiency
    - Configurable intensity and threshold

30. **Create `src/passes/ssaoPass.ts`**:
    - Screen-space ambient occlusion (GTAO or HBAO variant)
    - Requires depth buffer + (optional) normal buffer
    - Bilateral blur pass to denoise
    - Output: single-channel AO texture multiplied into ambient term

31. **Create `src/passes/tonemapPass.ts`**:
    - Full-screen quad (or compute) pass
    - Combines HDR color + bloom + SSAO → tonemap (ACES/PBR Neutral) → gamma → output to swapchain (`bgra8unorm`)
    - Optional FXAA pass chained after

32. **Create `src/passes/fxaaPass.ts`**:
    - FXAA 3.11 as a full-screen post-process
    - Runs on the tonemapped LDR output

---

### Phase 9 — Optional Advanced Passes (GPU Culling & MDI)

**Goal**: Port the legacy GPU culling as opt-in passes for high-performance rendering.

33. **Create `src/passes/resetPass.ts`** — Compute pass that zeros indirect draw buffer instance counts. Port from the `reset_main` entry in _.wgsl.

34. **Create `src/passes/cullPass.ts`** — Compute pass that performs per-instance frustum culling, compacts visible instances into a visible buffer, and increments indirect draw counts atomically. Port from `cull_main` in _.wgsl.

35. **Create `src/passes/indirectForwardPass.ts`** — A forward pass variant that uses `multiDrawIndexedIndirect` (behind a feature check for `chromium-experimental-multi-draw-indirect`). Falls back to individual `drawIndexed` calls if unsupported.

36. **Feature-detect and register** — At init, query adapter features. If MDI is available, register the cull + indirect passes; otherwise, use the standard forward pass.

---

### Phase 10 — Skeletal Animation

**Goal**: GPU-skinned meshes with bone hierarchies.

37. **Create `src/animation.ts`**:
    - `Skeleton`: bone hierarchy (parent indices), inverse-bind matrices, rest pose
    - `AnimationClip`: array of `Track` objects (per-bone keyframes for position, rotation, scale)
    - `AnimationSampler`: interpolates keyframes (linear, step, cubic spline), outputs a flat `Float32Array` of joint matrices
    - `AnimationMixer`: blends multiple clips (crossfade, additive layers)

38. **Joint matrix upload**: storage buffer of `mat4x4` per joint (max joints per skeleton: 256). Bind at `@group(2) @binding(1)`.

39. **Skinned vertex shader variant**: in the PBR vertex shader, when `HAS_SKINNING` flag is set, read `joints (uvec4)` + `weights (vec4)` vertex attributes and apply: `skinnedPos = sum(weight[i] * jointMatrix[joint[i]] * position)`.

40. **glTF loader** — `src/loaders/gltf.ts`:
    - Parse `.gltf` / `.glb` files
    - Extract meshes (with all vertex attributes), materials (PBR metallic-roughness), textures, skeletons, animations
    - Map to engine's `Mesh`, `Material`, `Skeleton`, `AnimationClip` types
    - This becomes the primary asset pipeline

---

### Phase 11 — Additional Modern Engine Features

41. **Skybox / procedural sky** — `src/passes/skyboxPass.ts`:
    - Renders a fullscreen quad or inverted cube with the environment cubemap
    - Depth trick: write `depth = 1.0` so it appears behind all geometry
    - Alternative: procedural atmospheric scattering (Preetham / Hosek-Wilkie model)

42. **Screen-space reflections (SSR)** — `src/passes/ssrPass.ts`:
    - Ray-march in screen space against the depth buffer
    - Hi-Z acceleration (depth mip chain)
    - Blend with environment map based on hit confidence

43. **Particle system** — `src/particles.ts`:
    - GPU compute-based particle simulation (position, velocity, lifetime, color)
    - Emit → simulate → render as billboarded quads
    - Integrate as a render graph pass

44. **Decals** — deferred or screen-space projected decals for surface details.

45. **LOD (Level of Detail)** — distance-based mesh switching or continuous LOD via mesh simplification metrics.

46. **Occlusion culling** — hierarchical Z-buffer (Hi-Z) occlusion culling as a compute pass, feeding the indirect draw buffer.

---

### Suggested File Structure

```
src/
  index.ts
  renderer.ts
  renderGraph.ts
  registry.ts
  camera.ts
  mesh.ts
  material.ts
  light.ts
  texture.ts
  pipeline.ts
  shader.ts
  primitive.ts
  renderObject.ts
  environment.ts
  animation.ts
  particles.ts
  math/
    index.ts
    transform.ts
    frustum.ts
  shaders/
    common.wgsl          (shared structs, uniforms)
    pbr.wgsl             (BRDF, lighting)
    shadow.wgsl           (shadow sampling)
    skinning.wgsl         (joint transform)
    bloom.wgsl
    ssao.wgsl
    tonemap.wgsl
    fxaa.wgsl
    sky.wgsl
    cull.wgsl
  passes/
    forwardPass.ts
    shadowPass.ts
    bloomPass.ts
    ssaoPass.ts
    tonemapPass.ts
    fxaaPass.ts
    skyboxPass.ts
    ssrPass.ts
    resetPass.ts
    cullPass.ts
    indirectForwardPass.ts
    particlePass.ts
  loaders/
    gltf.ts
```

---

**Verification**

- **Phase 1**: Render a spinning colored cube with perspective projection and depth testing
- **Phase 2–3**: Render multiple meshes with different materials (color-only), sorted by pipeline
- **Phase 4**: Lit scene with 3+ point lights and a directional light, PBR shading visible
- **Phase 5**: Textured PBR meshes loaded from images, environment-mapped reflections
- **Phase 6**: Add/remove passes dynamically; graph auto-reorders; no manual barrier management
- **Phase 7**: Visible shadows from a directional light with cascade visualization
- **Phase 8**: Bloom on bright surfaces, SSAO in corners, tone-mapped output
- **Phase 9**: Toggle GPU culling on/off; verify identical output with higher performance on large scenes
- **Phase 10**: Load a glTF skinned character, play animation clip
- **Phase 11**: Skybox renders, particles emit, SSR visible on metallic surfaces

**Decisions**
- Flat render-object list over ECS — simpler now, can migrate to ECS later
- GPU frustum culling + MDI as **optional** passes (not default), gated by feature detection
- Full PBR target scope including IBL, CSM shadows, bloom, SSAO, skeletal animation, glTF
- No bundler changes — keep implicit Vite assumption
- `uint16` index format as the standard (fix primitives), with `uint32` option for large meshes
- Bind group layout convention: group 0 = global, group 1 = material, group 2 = per-object, group 3 = environment/shadows