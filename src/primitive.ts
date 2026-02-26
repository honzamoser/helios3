export function createDiamond(): {
  vertices: Float32Array;
  indices: Uint32Array;
  normals: Float32Array;
} {
  const vertices = new Float32Array([
    // Top vertex
    0,
    1,
    0, // Vertex 0
    // Middle ring
    -0.5,
    0,
    -0.5, // Vertex 1
    0.5,
    0,
    -0.5, // Vertex 2
    0.5,
    0,
    0.5, // Vertex 3
    -0.5,
    0,
    0.5, // Vertex 4
    // Bottom vertex
    0,
    -1,
    0, // Vertex 5
  ]);

  const indices = new Uint32Array([
    // Top pyramid
    0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 1, 4,
    // Bottom pyramid
    5, 1, 2, 5, 2, 3, 5, 3, 4, 5, 4, 1,
  ]);

  const normals = new Float32Array([
    // Normals for each vertex
    0,
    1,
    0, // Vertex 0
    -0.707,
    0,
    -0.707, // Vertex 1
    0.707,
    0,
    -0.707, // Vertex 2
    0.707,
    0,
    0.707, // Vertex 3
    -0.707,
    0,
    0.707, // Vertex 4
    0,
    -1,
    0, // Vertex 5
  ]);

  return {
    vertices,
    indices,
    normals,
  };
}

export function createCube(): {
  vertices: Float32Array;
  indices: Uint16Array;
  normals: Float32Array;
} {
  // 8 vertices of a cube
  const vertices = new Float32Array([
    -1, -1, -1, // Vertex 0
    1, -1, -1, // Vertex 1
    1, 1, -1, // Vertex 2
    -1, 1, -1, // Vertex 3
    -1, -1, 1, // Vertex 4
    1, -1, 1, // Vertex 5
    1, 1, 1, // Vertex 6
    -1, 1, 1, // Vertex 7
  ]);

  const indices = new Uint16Array([
    // Front face
    0, 1, 2, 0, 2, 3,
    // Back face
    4, 5, 6, 4, 6, 7,
    // Left face
    0, 3, 7, 0, 7, 4,
    // Right face
    1, 5, 6, 1, 6, 2,
    // Top face
    3, 2, 6, 3, 6, 7,
    // Bottom face
    0, 1, 5, 0, 5, 4,
  ]);

  const normals = new Float32Array([

  ]);

  return {
    vertices,
    indices,
    normals,
  };
}

export function createPlane(): {
  vertices: Float32Array;
  indices: Uint32Array;
  normals: Float32Array;
} {
  const vertices = new Float32Array([
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5,
  ]);

  const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);

  const normals = new Float32Array([
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
  ]);

  return {
    vertices,
    indices,
    normals,
  };
}

export function createPyramid(): {
  vertices: Float32Array;
  indices: Uint32Array;
  normals: Float32Array;
} {
  const vertices = new Float32Array([
    // Base (y=0)
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5,
    // Back Face (z negative)
    -0.5, 0, -0.5, 0, 1, 0, 0.5, 0, -0.5,
    // Right Face (x positive)
    0.5, 0, -0.5, 0, 1, 0, 0.5, 0, 0.5,
    // Front Face (z positive)
    0.5, 0, 0.5, 0, 1, 0, -0.5, 0, 0.5,
    // Left Face (x negative)
    -0.5, 0, 0.5, 0, 1, 0, -0.5, 0, -0.5,
  ]);

  const indices = new Uint32Array([
    // Base
    0, 1, 2, 0, 2, 3,
    // Back
    4, 5, 6,
    // Right
    7, 8, 9,
    // Front
    10, 11, 12,
    // Left
    13, 14, 15,
  ]);

  const nY = 0.44721;
  const nXZ = 0.89443;

  const normals = new Float32Array([
    // Base (0, -1, 0)
    0,
    -1,
    0,
    0,
    -1,
    0,
    0,
    -1,
    0,
    0,
    -1,
    0,
    // Back (0, nY, -nXZ)
    0,
    nY,
    -nXZ,
    0,
    nY,
    -nXZ,
    0,
    nY,
    -nXZ,
    // Right (nXZ, nY, 0)
    nXZ,
    nY,
    0,
    nXZ,
    nY,
    0,
    nXZ,
    nY,
    0,
    // Front (0, nY, nXZ)
    0,
    nY,
    nXZ,
    0,
    nY,
    nXZ,
    0,
    nY,
    nXZ,
    // Left (-nXZ, nY, 0)
    -nXZ,
    nY,
    0,
    -nXZ,
    nY,
    0,
    -nXZ,
    nY,
    0,
  ]);

  return {
    vertices,
    indices,
    normals,
  };
}