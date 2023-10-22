@group(0) @binding(0) var<uniform> grid: vec2<f32>;
@group(0) @binding(1) var<uniform> dt: f32;
@group(0) @binding(2) var<storage> mvp: mat4x4<f32>;

struct Particle{
  pos: vec3<f32>, // 8 bytes, 8 byte aligned
  mass: f32, // 4 bytes, 4 byte aligned
  vel: vec3<f32>, // 8 bytes, 8 byte aligned
}

struct Particles {
  particles: array<Particle>,
}
@group(0) @binding(3) var<storage> dataIn: Particles;
@group(0) @binding(4) var<storage, read_write> dataOut: Particles;

fn particleIndex(id: vec2u) -> u32 {
  return (id.y % u32(grid.y)) * u32(grid.x) + (id.x % u32(grid.x));
}

fn kick_drift_kick(particle : Particle, acc : vec3<f32>) -> Particle {
  let vel_half = particle.vel + acc * dt * 0.5;
  let pos_full = particle.pos + vel_half * dt;
  let vel_full = vel_half + acc * dt * 0.5;

  return Particle(pos_full, particle.mass, vel_full);
}

fn force(particle : Particle, attractor : vec3<f32>) -> vec3<f32> {
  let r = particle.pos - attractor;
  let d = length(r) + 0.001;
  return -r * (1.0 / (d * d)) * particle.mass;
}

// Make sure workgroup_size is equivalent to constant in main.ts
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
 
  let i = particleIndex(id.xy);
  var particle = dataIn.particles[i];

  let force = force(particle, vec3<f32>(0., 0., 0.)) * 0.1;
  //let force = vec2<f32>(0., 0.);

  dataOut.particles[i] = kick_drift_kick(particle, force);
}