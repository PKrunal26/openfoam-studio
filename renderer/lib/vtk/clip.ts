// Plane clip: keeps the cells whose centroid lies on the +normal side. Cell
// boundaries stay intact (no cell cutting), so the clipped surface is exact
// mesh geometry — slightly stair-stepped at the plane, like a cell-zone view.
// Pure TypeScript, no vtk.js imports.

import type { VtkCells } from './legacyVtkParser'

export function clipCells(
  points: Float32Array,
  cells: VtkCells,
  origin: [number, number, number],
  normal: [number, number, number],
): VtkCells {
  const { connectivity, offsets, types } = cells
  const numCells = types.length

  const keep: number[] = []
  for (let c = 0; c < numCells; c++) {
    const start = offsets[c]!
    const end = offsets[c + 1]!
    let cx = 0
    let cy = 0
    let cz = 0
    for (let i = start; i < end; i++) {
      const p = connectivity[i]!
      cx += points[p * 3]!
      cy += points[p * 3 + 1]!
      cz += points[p * 3 + 2]!
    }
    const n = end - start
    cx /= n
    cy /= n
    cz /= n
    const side =
      (cx - origin[0]) * normal[0] + (cy - origin[1]) * normal[1] + (cz - origin[2]) * normal[2]
    if (side >= 0) keep.push(c)
  }

  let connSize = 0
  for (const c of keep) connSize += offsets[c + 1]! - offsets[c]!

  const outConn = new Uint32Array(connSize)
  const outOffsets = new Uint32Array(keep.length + 1)
  const outTypes = new Uint8Array(keep.length)
  let dst = 0
  keep.forEach((c, idx) => {
    outOffsets[idx] = dst
    outTypes[idx] = types[c]!
    for (let i = offsets[c]!; i < offsets[c + 1]!; i++) outConn[dst++] = connectivity[i]!
  })
  outOffsets[keep.length] = dst

  return { connectivity: outConn, offsets: outOffsets, types: outTypes }
}
