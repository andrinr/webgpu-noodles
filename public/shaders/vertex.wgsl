struct VertexInput {
  @location(0) pos: vec3f,
  @location(1) uv: vec2f,
  @builtin(instance_index) instance: u32,
};

struct VertexOutput {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) vel: vec3f,
  @location(2) mass: f32,
};

@group(0) @binding(0) var<uniform> grid: vec2f;
@group(0) @binding(1) var<uniform> dt: f32;
@group(0) @binding(2) var<uniform> traceLength: u32;
@group(0) @binding(3) var<storage> mvp: mat4x4<f32>;

struct Particle{
  pos: vec3<f32>, // 8 bytes, 8 byte aligned
  mass: f32, // 4 bytes, 4 byte aligned
  vel: vec3<f32>, // 8 bytes, 8 byte aligned
}
@group(0) @binding(4) var<storage> particleState: array<Particle>;

@vertex
fn main(
  in : VertexInput) -> VertexOutput {

  let instance = in.instance;

  let pos = particleState[instance].pos + in.pos * 0.003;

  var output: VertexOutput;
  output.pos = mvp * vec4<f32>(pos, 1.0);
  output.uv = in.uv;
  output.vel = particleState[instance].vel;
  output.mass = particleState[instance].mass;
  return output;
}