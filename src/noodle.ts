
export const genNoodle = (l : number) : [Float32Array, Uint16Array] => {
    const nUniqueVertices = l * 4;

    const vertexData : Float32Array = new Float32Array(nUniqueVertices * 2);

    const nUniqueTriangles =
        2 * 2 + // For the top and bottom quad
        (l - 1) * 4 * 2// for each element 4 quads thus 8 triangles

    const indexData : Uint16Array = new Uint16Array(nUniqueTriangles * 3);

    const setQuadIndexData = (indexData : Uint16Array, vertices : Uint16Array, i : number) : number => {
        indexData[i] = vertices[0];
        indexData[i + 1] = vertices[1];
        indexData[i + 2] = vertices[2];
        indexData[i + 3] = vertices[0];
        indexData[i + 4] = vertices[2];
        indexData[i + 5] = vertices[3];

        console.log(indexData[i], indexData[i + 1], indexData[i + 2], indexData[i + 3], indexData[i + 4], indexData[i + 5]);

        return i + 6;
    }

    // Top quad
    let k = 0;
    k = setQuadIndexData(indexData, new Uint16Array([0, 1, 2, 3]), k);

    for (let columnID = 0; columnID < l-1; columnID++) {
        for (let side = 0; side < 4; side++) {
            let a = columnID * 4 + side;
            let b = columnID * 4 + (side + 1) % 4;
            let c = a + 4;
            let d = b + 4;
   
            k = setQuadIndexData(indexData, new Uint16Array([a, b, c, d]), k);
        }
    }

    // Bottom quad
    k = setQuadIndexData(indexData, new Uint16Array([4 * l - 4, 4 * l - 3, 4 * l - 2, 4 * l - 1]), k);

    //console.log(indexData);
    if (k !== nUniqueTriangles * 3)  {
        throw new Error("k and precumputed k should match");
    }

    return [vertexData, indexData];
}