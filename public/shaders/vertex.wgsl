struct VertexInput {
  @location(0) pos: vec2f,
  @builtin(instance_index) instance_index: u32,
  @builtin(vertex_index) vertex_index: u32,
};

struct VertexOutput {
  @builtin(position) pos: vec4f,
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) vel: vec3f,
};

struct Constants {
  grid : vec2f,
  dt : f32,
  noodle_sections : f32,
  noodle_rotational_elements : f32,
  noodle_radius : f32,
}

@group(0) @binding(0) var<uniform> constants: Constants;
@group(0) @binding(1) var<storage> mvp: mat4x4<f32>;

struct Particle{
  pos: vec3<f32>, // 8 bytes, 8 byte aligned
  mass: f32, // 4 bytes, 4 byte aligned
  vel: vec3<f32>, // 8 bytes, 8 byte aligned
  lifetime: f32, // 4 bytes, 4 byte aligned
  color: vec3<f32> // 12 bytes, 4 byte aligned
}
@group(0) @binding(2) var<storage> particles: array<Particle>;

@vertex
fn main(in : VertexInput) -> VertexOutput {

  let sections = u32(constants.noodle_sections);
  let elements = u32(constants.noodle_rotational_elements);

  // global id
  let particleId = u32(in.instance_index * sections + in.vertex_index / elements);
  let particle = particles[particleId];

  let tangent = normalize(cross(particle.vel, vec3<f32>(0.0, 1.0, 1.0)));
  let bitangent = normalize(cross(particle.vel, tangent));

  let pointOnCircle = f32(in.vertex_index) / f32(elements) * 2.0 * 3.14159265359;

  let normal = normalize(cos(pointOnCircle) * tangent + sin(pointOnCircle) * bitangent);

  let pos = particle.pos + normal * constants.noodle_radius;
  //let pos = vec3f(rand() - 0.5, rand() - 0.5, rand() - 0.5) * 10.;

  var output: VertexOutput;
  output.pos = mvp * vec4<f32>(pos, 1.0);
  output.vel = particle.vel;
  output.normal = normal;
  output.position = pos;

  return output;
}