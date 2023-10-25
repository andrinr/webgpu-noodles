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

struct Particles {
  particles: array<Particle>,
}
@group(0) @binding(2) var<storage> dataIn: Particles;
@group(0) @binding(3) var<storage, read_write> dataOut: Particles;

fn particleIndex(id: vec2u) -> u32 {
  return (id.y % u32(constants.grid.y)) * u32(constants.grid.x) + (id.x % u32(constants.grid.x));
}

fn damping(particle : Particle) -> Particle {
  return Particle(particle.pos, particle.mass, particle.vel * 0.9999, particle.lifetime, particle.color);
}

fn kick_drift_kick(particle : Particle, acc : vec3<f32>) -> Particle {
  let vel_half = particle.vel + acc * constants.dt * 0.5;
  let pos_full = particle.pos + vel_half * constants.dt;
  let vel_full = vel_half + acc * constants.dt * 0.5;

  return Particle(pos_full, particle.mass, vel_full, particle.lifetime, particle.color);
}

fn gravity_force(particle : Particle, attractor : vec3<f32>) -> vec3<f32> {
  let r = attractor - particle.pos;
  let d = length(r) + 0.001;
  return normalize(r) * (1.0 / (d)) * particle.mass;
}

fn rubber_force(particle : Particle, attractor : vec3<f32>) -> vec3<f32> {
  let r = attractor - particle.pos;
  let d = length(r) + 0.001;
  return normalize(r) * d * d * particle.mass;
}

// Make sure workgroup_size is equivalent to constant in main.ts
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {

  let sections = u32(constants.noodle_sections);
 
  let i = particleIndex(id.xy) * sections;
  
  let particle = dataIn.particles[i];

  // secondary particle system
  for (var j = 0u; j < sections - 1u; j = j + 1u) {
    // let force = rubber_force(dataIn.particles[i + j + 1u], dataIn.particles[i + j].pos) * 0.01;
    // dataOut.particles[i + j + 1u] = kick_drift_kick(dataIn.particles[i + j + 1u], force);
    //dataOut.particles[i + j + 1u] = damping(dataIn.particles[i + j + 1u]);
    let r = dataIn.particles[i + j ].pos - dataIn.particles[i + j + 1u].pos;
    dataOut.particles[i + j + 1u].pos = dataIn.particles[i + j + 1u].pos + r / 40.0;
    dataOut.particles[i + j + 1u].vel = normalize(r) * length(particle.vel);
  }


  let force = gravity_force(particle, vec3<f32>(0., 0., 0.)) * 0.1;

  dataOut.particles[i] = kick_drift_kick(particle, force);
}