const s : number = 1.0;
export const vertices : Float32Array = new Float32Array([
    // x, y, u, v
    -s, -s, 0, 0, 0, // Triangle 1
    s, -s, 0, 1, 0,
    s, s, 0, 1, 1,
    -s, -s, 0, 0, 0, // Triangle 2
    s, s, 0, 1, 1,
    -s, s, 0, 0, 1,
]);