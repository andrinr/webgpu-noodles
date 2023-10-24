
export const genNoodle = (sections : number, rotationalElements : number) : [Float32Array, Uint16Array] => {
    const nUniqueVertices = sections * 4;

    const vertexData : Float32Array = new Float32Array(nUniqueVertices * 2);

    const nUniqueTriangles = (sections - 1) * rotationalElements * 2

    const indexData : Uint16Array = new Uint16Array(nUniqueTriangles * 3);

    const setQuadIndexData = (indexData : Uint16Array, vertices : Uint16Array, i : number) : number => {
        indexData[i] = vertices[0];
        indexData[i + 1] = vertices[1];
        indexData[i + 2] = vertices[2];
        indexData[i + 3] = vertices[1];
        indexData[i + 4] = vertices[2];
        indexData[i + 5] = vertices[3];

        //console.log(indexData[i], indexData[i + 1], indexData[i + 2], indexData[i + 3], indexData[i + 4], indexData[i + 5]);

        return i + 6;
    }

    let k = 0;
    for (let columnID = 0; columnID < sections-1; columnID++) {
        for (let side = 0; side < rotationalElements; side++) {
            let a = columnID * 4 + side;
            let b = columnID * 4 + (side + 1) % 4;
            let c = a + 4;
            let d = b + 4;
   
            k = setQuadIndexData(indexData, new Uint16Array([a, b, c, d]), k);
        }
    }

    //console.log(indexData);
    if (k !== nUniqueTriangles * 3)  {
        throw new Error("k and precumputed k should match");
    }

    return [vertexData, indexData];
}