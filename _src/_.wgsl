struct Uniforms {
    viewProj: mat4x4<f32>,
    frustrumPlanes: array<vec4<f32>, 6>,
    time : f32,
    instanceCount: u32,
};

struct Instances {
    modelMatrix : mat4x4<f32>,
    color : vec4<f32>,
    commandId: f32
}

struct IndirectCommand {
    indexCount : u32,
    instanceCount : atomic<u32>, // <--- We will toggle this!
    firstIndex : u32,
    baseVertex : u32,
    firstInstance : u32,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;

// VERTEX ONLY
@group(1) @binding(0) var<storage, read> instanceBuffer : array<Instances>;
@group(1) @binding(1) var<storage, read> visibleInstances : array<u32>;

// COMPUTE ONLY
@group(1) @binding(0) var<storage, read_write> commands: array<IndirectCommand>;
@group(1) @binding(1) var<storage, read_write> visibleInstancesWrite: array<u32>;
@group(1) @binding(2) var<storage, read> ComputeInstanceBuffer: array<Instances>;

@group(2) @binding(0) var<storage, read_write> debugBugger: array<u32>;

struct VertexOutput {
    @builtin(position) Position : vec4<f32>,
    @location(0) color : vec4<f32>,
    @location(1) normal : vec3<f32>,
    @location(2) fragPos : vec4<f32>,
};

fn checkFrustrum(center: vec3<f32>, radius: f32, planes: array<vec4<f32>, 6>) -> bool {
    for(var i = 0; i < 6; i++) {
        let plane = planes[i];
        let distance = dot(plane.xyz, center) + plane.w;
        if(distance < -radius) {
            return false;
        }
    }
    return true;
}

@compute @workgroup_size(64)
fn reset_main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
    let index = GlobalInvocationID.x;
    if(index >= arrayLength(&commands)) {
        return;
    }
    atomicStore(&commands[index].instanceCount, 0u);
}

@compute @workgroup_size(64)
fn cull_main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
    let index = GlobalInvocationID.x;

    if(index >= uniforms.instanceCount) {
        return;
    }

    let matrix = ComputeInstanceBuffer[index].modelMatrix;
    let center = matrix[3].xyz;
    let commandIndex = u32(ComputeInstanceBuffer[index].commandId);
    let firstInstance = commands[commandIndex].firstInstance;

    let debugIndexPosition = index * 2u;
    let debugCommandIdPosition = index * 2u + 1;
    
    debugBugger[debugIndexPosition] = index;
    debugBugger[debugCommandIdPosition] = commandIndex;

    let radius = 3.0;

    let isVisible = checkFrustrum(center, radius, uniforms.frustrumPlanes);
    // let isVisible = true;

    if(isVisible) {
        let outIndex = atomicAdd(&commands[commandIndex].instanceCount, 1u);
        visibleInstancesWrite[firstInstance + outIndex] = index;
    }
}
@vertex
fn vs_main(
    @builtin(instance_index) ii : u32,
    @location(0) pos : vec3<f32>,
    @location(1) normal : vec3<f32>,
) -> VertexOutput {
    let index = visibleInstances[ii];
    let instData = instanceBuffer[index];
    let worldPos = instData.modelMatrix * vec4<f32>(pos, 1.0);

    var out: VertexOutput;
    out.Position = uniforms.viewProj * worldPos;
    out.color = instData.color;
    out.normal = (instData.modelMatrix * vec4<f32>(normal, 0.0)).xyz;
    out.fragPos = worldPos;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Normalize interpolated normal
                    let N = normalize(in.normal);

                    // Light Setup
                    // Light rotates around center at a distance of 10
                    let lightPos = vec3<f32>(
                        10.0,//  * cos(uniforms.time / 1000),
                        10.0,
                        10.0, // * sin(uniforms.time / 1000)
                    );
                    let lightColor = vec3<f32>(1.0, 1.0, 1.0);
                    let lightRange = 100.0;
                    let ambient = vec3<f32>(0.1, 0.1, 0.1);

                    // Calculate Vector from Fragment World Pos to Light
                    let lightDirVec = lightPos - in.fragPos.xyz;
                    let dist = length(lightDirVec);
                    let L = normalize(lightDirVec);

                    // Attenuation
                    let att = max(1.0 - (dist / lightRange), 0.0);

                    // Diffuse
                    let diff = max(dot(N, L), 0.0);

                    // Combine
                    let diffuseLight = lightColor * diff * att;
                    let totalLight = ambient + diffuseLight;

                    // Apply to object color
                    let finalRGB = in.color.rgb * totalLight;

                    return vec4<f32>(finalRGB, in.color.a);
}
