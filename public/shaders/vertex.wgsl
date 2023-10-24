struct VertexInput {
  @location(0) pos: vec2f,
  @builtin(instance_index) instance_index: u32,
  @builtin(vertex_index) vertex_index: u32,
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
  lifetime: f32, // 4 bytes, 4 byte aligned
  color: vec3<f32> // 12 bytes, 4 byte aligned
}
@group(0) @binding(4) var<storage> particleState: array<Particle>;

@vertex
fn main(
  in : VertexInput) -> VertexOutput {

  // global id
  let particleId = u32(in.instance_index * traceLength + in.vertex_index / 4);
  let particle = particleState[particleId];

  let tangent = normalize(cross(particle.vel, vec3<f32>(0.0, 1.0, 1.0)));
  let bitangent = normalize(cross(particle.vel, tangent));

  var offset = vec3<f32>(0.);
  let index = in.vertex_index;
  if (in.vertex_index % 4 == 0) {
    offset = tangent;
  }
  else if (in.vertex_index % 4 == 1) {
    offset = -bitangent;
  }
  else if (in.vertex_index % 4 == 2) {
    offset = -tangent;
  }
  else if (in.vertex_index % 4 == 3) {
    offset = bitangent;
  }

  let pos = particle.pos + offset * 0.03;
  //let pos = vec3f(rand() - 0.5, rand() - 0.5, rand() - 0.5) * 10.;

  var output: VertexOutput;
  output.pos = mvp * vec4<f32>(pos, 1.0);
  output.uv = vec2<f32>(0.);
  output.vel = particle.vel;
  output.mass = particle.mass;
  return output;
}