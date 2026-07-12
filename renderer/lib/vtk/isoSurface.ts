// Iso-surface extraction (marching tetrahedra) on a per-point scalar field.
// Pure TypeScript, no vtk.js imports.

import type { VtkCells } from './legacyVtkParser'
import { tetrahedralize } from './tetrahedralize'
import { contourTets, type ContourSurface } from './slice'

export function isoSurface(
  points: Float32Array,
  cells: VtkCells,
  scalars: Float32Array,
  isoValue: number,
  precomputedTets?: Uint32Array,
): ContourSurface {
  const tets = precomputedTets ?? tetrahedralize(cells).tets
  const values = new Float32Array(scalars.length)
  for (let i = 0; i < scalars.length; i++) values[i] = scalars[i]! - isoValue
  return contourTets(points, tets, values)
}
