/**
 * Default lit shader supporting the material-shader bind group convention:
 *   group(0) = Global uniforms (viewProjection)
 *   group(1) = Material uniforms (albedo, emissive, roughness, metallic)
 *   group(2) = Per-object uniforms (model matrix)
 *
 * Shader preprocessor flags:
 *   HAS_NORMALS  — enables normal vertex attribute and basic diffuse lighting
 */
export const DEFAULT_LIT_SHADER = /* wgsl */ `

struct GlobalUniforms {
    viewProjection: mat4x4<f32>,
};

struct MaterialUniforms {
    albedo: vec4<f32>,
    emissive: vec4<f32>,
    params: vec4<f32>,
};

struct ModelUniforms {
    model: mat4x4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) worldPosition: vec3<f32>,
#ifdef HAS_NORMALS
    @location(1) normal: vec3<f32>,
#endif
};

@group(0) @binding(0) var<uniform> global: GlobalUniforms;
@group(1) @binding(0) var<uniform> material: MaterialUniforms;
@group(2) @binding(0) var<uniform> model: ModelUniforms;

@vertex
fn main(
    @location(0) position: vec3<f32>,
#ifdef HAS_NORMALS
    @location(1) normal: vec3<f32>,
#endif
) -> VertexOutput {
    var output: VertexOutput;
    let worldPos = model.model * vec4<f32>(position, 1.0);
    output.position = global.viewProjection * worldPos;
    output.worldPosition = worldPos.xyz;
#ifdef HAS_NORMALS
    output.normal = (model.model * vec4<f32>(normal, 0.0)).xyz;
#endif
    return output;
}

@fragment
fn frag_main(
    @location(0) worldPosition: vec3<f32>,
#ifdef HAS_NORMALS
    @location(1) normal: vec3<f32>,
#endif
) -> @location(0) vec4<f32> {
    let albedo = material.albedo;
    let emissive = material.emissive.xyz;
    let roughness = material.params.x;
    let metallic = material.params.y;

#ifdef HAS_NORMALS
    // Basic directional lighting
    let lightDir = normalize(vec3<f32>(1.0, 1.0, 1.0));
    let N = normalize(normal);
    let NdotL = max(dot(N, lightDir), 0.0);

    let ambient = vec3<f32>(0.15);
    let diffuse = albedo.rgb * NdotL;
    let color = ambient * albedo.rgb + diffuse + emissive;
#else
    // No normals — use world position for simple coloring mixed with albedo
    let posColor = abs(normalize(worldPosition));
    let color = albedo.rgb * (0.5 + 0.5 * posColor) + emissive;
#endif

    return vec4<f32>(color, albedo.a);
}
`;
