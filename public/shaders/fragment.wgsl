struct FragOutput {
  @location(0) mass : vec4<f32>,
  @location(1) color : vec4<f32>,
}

struct FragInput {
  @location(0) pos : vec3f,
  @location(1) normal: vec3f,
  @location(2) vel: vec3f,
};
// define sun position
const sun_pos = vec3f(0.0, 0.0, 5.0);

@fragment
fn main(input: FragInput) -> @location(0) vec4f {
  //let color = vec4f(abs(input.vel)*10.0, 0.0);

  var color = vec4f(0.0, 0.0, 0.0, 1.0);
  let light_dir = normalize(sun_pos - input.pos);
  let light = max(dot(input.normal, light_dir), 0.0);
  color += vec4f(light, light, light, 1.0);


  //output.color = vec4f(1.0, 1.0, 1.0, 1.0);
  
  //output.color *= max(0.5 - length(input.uv - vec2f(0.5)), 0.0);
  // output.color = vec4(input.uv, 0.0, 1.0);
  return color;
}
