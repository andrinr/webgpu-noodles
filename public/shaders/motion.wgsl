@group(0) @binding(0) var<uniform> grid: vec2f;
@group(0) @binding(1) var<uniform> dt: f32;
@group(0) @binding(2) var<storage> stenctil: mat3x3f;
@group(0) @binding(2) var<storage> particleStateIn: array<f32>;
@group(0) @binding(3) var<storage, read_write> particleStateOut: array<f32>;

fn particleIndex(id: vec2u) -> u32 {
  return (id.y % u32(grid.y)) * u32(grid.x) + (id.x % u32(grid.x));
}

fn kick_drift_kick(pos: vec2f, vel: vec2f, acc: vec2f) -> vec4f {
  let vel_half = vel + acc * dt * 0.5;
  let pos_full = pos + vel_half * dt;
  let vel_full = vel_half + acc * dt * 0.5;

  return vec4f(pos_full, vel_full);
}

fn force(pos: vec2f, body: vec2f, mass: f32) -> vec2f {
  let r = pos - body;
  let d = length(r) + 0.001;
  return -r * (1.0 / (d * d)) * mass;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
 
  let i = particleIndex(id.xy);
  let particle_pos = vec2(particleStateIn[i], particleStateIn[i + 1]);
  let particle_vel = vec2(particleStateIn[i + 2], particleStateIn[i + 3]);
  let particle_mass = particleStateIn[i + 4];

  let particle_acc = force(particle_pos, vec2f(0., 0.), particle_mass) * 0.004;

  let new_state = kick_drift_kick(particle_pos, particle_vel, particle_acc);

  particleStateOut[i] = new_state.x;
  particleStateOut[i + 1] = new_state.y;
  particleStateOut[i + 2] = new_state.z;
  particleStateOut[i + 3] = new_state.w;
  particleStateOut[i + 4] = particle_mass;
}