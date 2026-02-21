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
  indices: Uint32Array;
  normals: Float32Array;
} {
  // 24 vertices (4 per face * 6 faces) to support flat shading (unique normals per face)
  const vertices = new Float32Array([
    // Front face (z = 0.5)
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
    // Back face (z = -0.5)
    0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5,
    // Top face (y = 0.5)
    -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
    // Bottom face (y = -0.5)
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
    // Right face (x = 0.5)
    0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5,
    // Left face (x = -0.5)
    -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5,
  ]);

  const indices = new Uint32Array([
    // Front
    0, 1, 2, 0, 2, 3,
    // Back
    4, 5, 6, 4, 6, 7,
    // Top
    8, 9, 10, 8, 10, 11,
    // Bottom
    12, 13, 14, 12, 14, 15,
    // Right
    16, 17, 18, 16, 18, 19,
    // Left
    20, 21, 22, 20, 22, 23,
  ]);

  const normals = new Float32Array([
    // Front (0, 0, 1)
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    // Back (0, 0, -1)
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    // Top (0, 1, 0)
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    // Bottom (0, -1, 0)
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    // Right (1, 0, 0)
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
    // Left (-1, 0, 0)
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
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