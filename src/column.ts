export const getVertexData = (l : number) : [Float32Array, Uint16Array] => {
    const nUniqueVertices = l * 4;

    const vertexData : Float32Array = new Float32Array(nUniqueVertices * 2);

    const nUniqueTriangles =
        4 + // For the top and bottom quad
        (l - 1) * 8 // for each element 4 quads thus 8 triangles

    const indexData : Uint16Array = new Uint16Array(nUniqueTriangles);

    const setQuadIndexData = (indexData : Uint16Array, vertices : Uint16Array, i : number) : number => {
        indexData[i] = vertices[0];
        indexData[i + 1] = vertices[1];
        indexData[i + 2] = vertices[2];
        indexData[i + 3] = vertices[0];
        indexData[i + 4] = vertices[2];
        indexData[i + 5] = vertices[3];

        return i + 6;
    }

    // Top quad
    let k = 0;
    k = setQuadIndexData(indexData, new Uint16Array([0, 1, 2, 3]), k);

    for (let i = 0; i < l; i++)
        k = setQuadIndexData(indexData, new Uint16Array([4 * i + 0, 4 * i + 1, 4 * i + 4, 4 * i + 5]), k);

    // Bottom quad
    k = setQuadIndexData(indexData, new Uint16Array([4 * l - 4, 4 * l - 3, 4 * l - 2, 4 * l - 1]), k);

    return [vertexData, indexData];
}