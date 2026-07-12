// External-surface extraction for unstructured grids. vtk.js v35 has no
// GeometryFilter, so we find the faces that belong to exactly one cell —
// that set is the outer skin of the mesh (incl. the visible plane of 2D
// OpenFOAM cases). Pure TypeScript, no vtk.js imports.

import type { VtkCells } from './legacyVtkParser'

export interface ExtractedSurface {
  /** vtk cell-array layout [n, id0..idn-1, ...] — point ids index the grid's points */
  polys: Uint32Array
  numFaces: number
  /** cell index (into the source grid) that owns each external face */
  faceOwnerCells: Uint32Array
}

// Faces per VTK cell type, as point-index positions within the cell.
// Winding is outward-facing per VTK conventions where it matters; the
// renderer draws both sides, so consistency is enough.
const CELL_FACES: Record<number, number[][]> = {
  // VTK_TETRA
  10: [[0, 1, 3], [1, 2, 3], [2, 0, 3], [0, 2, 1]],
  // VTK_HEXAHEDRON — bottom 0123, top 4567
  12: [
    [0, 3, 2, 1], [4, 5, 6, 7],
    [0, 1, 5, 4], [1, 2, 6, 5],
    [2, 3, 7, 6], [3, 0, 4, 7],
  ],
  // VTK_WEDGE — triangles 012 / 345, three quads
  13: [
    [0, 2, 1], [3, 4, 5],
    [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5],
  ],
  // VTK_PYRAMID — quad base + four triangles
  14: [
    [0, 3, 2, 1],
    [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4],
  ],
}

export function extractExternalSurface(
  _points: Float32Array,
  cells: VtkCells,
): ExtractedSurface {
  const { connectivity, offsets, types } = cells
  const numCells = types.length

  // First occurrence of each face keyed by sorted point ids. Faces seen twice
  // are interior and dropped.
  const seen = new Map<string, { cell: number; pts: number[] } | null>()

  for (let c = 0; c < numCells; c++) {
    const type = types[c]!
    const faces = CELL_FACES[type]
    if (!faces) throw new Error(`Unsupported VTK cell type ${type} in surface extraction`)
    const base = offsets[c]!
    for (const face of faces) {
      const pts = new Array<number>(face.length)
      for (let i = 0; i < face.length; i++) pts[i] = connectivity[base + face[i]!]!
      const key = [...pts].sort((a, b) => a - b).join(',')
      if (seen.has(key)) {
        seen.set(key, null) // interior — shared by two cells
      } else {
        seen.set(key, { cell: c, pts })
      }
    }
  }

  let numFaces = 0
  let polySize = 0
  for (const entry of seen.values()) {
    if (entry) {
      numFaces++
      polySize += entry.pts.length + 1
    }
  }

  const polys = new Uint32Array(polySize)
  const faceOwnerCells = new Uint32Array(numFaces)
  let p = 0
  let f = 0
  for (const entry of seen.values()) {
    if (!entry) continue
    polys[p++] = entry.pts.length
    for (const id of entry.pts) polys[p++] = id
    faceOwnerCells[f++] = entry.cell
  }

  return { polys, numFaces, faceOwnerCells }
}
