// Decomposes the common OpenFOAM cell types into tetrahedra. Every volume
// filter (slice, iso-surface, streamlines) runs on the tet soup, so the
// marching/interpolation code only has one cell shape to care about.
// Pure TypeScript, no vtk.js imports.

import type { VtkCells } from './legacyVtkParser'

export interface TetMesh {
  /** 4 point ids per tet */
  tets: Uint32Array
  /** source cell index per tet */
  owner: Uint32Array
}

// Decompositions as point-index positions within each cell (VTK orderings).
const TET_SPLITS: Record<number, number[][]> = {
  // VTK_TETRA
  10: [[0, 1, 2, 3]],
  // VTK_HEXAHEDRON — six tets sharing the 0–6 diagonal (uniform, no parity)
  12: [
    [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6],
    [0, 7, 4, 6], [0, 4, 5, 6], [0, 5, 1, 6],
  ],
  // VTK_WEDGE
  13: [[0, 1, 2, 4], [0, 2, 5, 4], [0, 5, 3, 4]],
  // VTK_PYRAMID
  14: [[0, 1, 2, 4], [0, 2, 3, 4]],
}

export function tetrahedralize(cells: VtkCells): TetMesh {
  const { connectivity, offsets, types } = cells
  const numCells = types.length

  let count = 0
  for (let c = 0; c < numCells; c++) {
    const split = TET_SPLITS[types[c]!]
    if (!split) throw new Error(`Unsupported VTK cell type ${types[c]} in tetrahedralization`)
    count += split.length
  }

  const tets = new Uint32Array(count * 4)
  const owner = new Uint32Array(count)
  let t = 0
  for (let c = 0; c < numCells; c++) {
    const base = offsets[c]!
    for (const split of TET_SPLITS[types[c]!]!) {
      owner[t >> 2] = c
      tets[t++] = connectivity[base + split[0]!]!
      tets[t++] = connectivity[base + split[1]!]!
      tets[t++] = connectivity[base + split[2]!]!
      tets[t++] = connectivity[base + split[3]!]!
    }
  }
  return { tets, owner }
}
