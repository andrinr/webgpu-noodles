struct FragOutput {
  @location(0) mass : vec4<f32>,
  @location(1) color : vec4<f32>,
}

struct FragInput {
  @location(0) uv: vec2f,
  @location(1) vel: vec3f,
  @location(2) mass: f32,
};

@fragment
fn main(input: FragInput) -> @location(0) vec4f {
  var output : FragOutput;
  output.mass = vec4f(input.mass, 0.0, 0.0, 1.0);
  output.color = vec4f(abs(input.vel)*10.0, 0.0);

  output.color = vec4f(1.0, 1.0, 1.0, 1.0);
  
  //output.color *= max(0.5 - length(input.uv - vec2f(0.5)), 0.0);
  // output.color = vec4(input.uv, 0.0, 1.0);
  return output.color;
}
