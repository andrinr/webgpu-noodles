@group(0) @binding(0) var<uniform> grid: vec2f;
@group(0) @binding(1) var<uniform> dt: f32;
@group(0) @binding(2) var<storage> stenctil: mat3x3f;

struct Particle{
  pos: vec2f;
  vel: vec2f;
  mass: f32;
}
@group(0) @binding(3) var<storage> particleStateIn: array<Particle>;
@group(0) @binding(4) var<storage, read_write> particleStateOut: array<Particle>;

var<workgroup> tile : array<array<vec3<f32>, 128>, 4>;

@compute @workgroup_size(32, 1, 1)
fn main(
  @builtin(workgroup_id) WorkGroupID : vec3<u32>,
  @builtin(local_invocation_id) LocalInvocationID : vec3<u32>
) {
  textureSample()
}