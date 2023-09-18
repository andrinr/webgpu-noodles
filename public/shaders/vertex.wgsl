struct VertexInput {
  @location(0) pos: vec2f,
  @builtin(instance_index) instance: u32,
};

struct VertexOutput {
  @builtin(position) pos: vec4f,
  @location(0) vel: vec2f,
  @location(1) mass: f32,
};

@group(0) @binding(0) var<uniform> grid: vec2f;
@group(0) @binding(1) var<uniform> dt: f32;
@group(0) @binding(2) var<storage> stenctil: mat3x3f;
@group(0) @binding(3) var<storage> particleState: array<vec4f>;

@vertex
fn main(
  @location(0) vertex_pos: vec2f,
  @builtin(instance_index) instance: u32) -> VertexOutput {

  let particle_pos = particleState[instance].xy;
  let particle_vel = particleState[instance].zw;
  let particle_mass = particleState[instance].w;

  let pos = particle_pos + vertex_pos * 0.003;

  var output: VertexOutput;
  output.pos = vec4f(pos, 0, 1);
  output.vel = particle_vel;
  output.mass = particle_mass;
  return output;
}