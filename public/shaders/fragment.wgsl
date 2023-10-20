struct FragOutput {
  @location(0) mass : vec4<f32>,
  @location(1) color : vec4<f32>,
}

struct FragInput {
  @location(0) vel: vec2f,
  @location(1) mass: f32,
};

@fragment
fn main(input: FragInput) -> @location(0) vec4f {
  var output : FragOutput;
  output.mass = vec4f(input.mass, 0.0, 0.0, 1.0);
  output.color = vec4f(1.0, 1.0, 1.0, 1.0);
  
  return vec4f(abs(input.vel), input.mass, 1.0);
}
