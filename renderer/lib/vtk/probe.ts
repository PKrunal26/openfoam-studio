// Point probe: interpolated value of every point field at a world position.
// Pure TypeScript, no vtk.js imports.

import type { VtkCells, VtkDataArray } from './legacyVtkParser'
import { tetrahedralize } from './tetrahedralize'
import { TetLocator } from './tetLocator'

/**
 * Returns each field's interpolated components at p (barycentric within the
 * containing tet), or null when p is outside the mesh.
 */
export function probePoint(
  points: Float32Array,
  cells: VtkCells,
  pointData: Record<string, VtkDataArray>,
  p: [number, number, number],
  precomputedTets?: Uint32Array,
): Record<string, number[]> | null {
  const tets = precomputedTets ?? tetrahedralize(cells).tets
  const locator = new TetLocator(points, tets)
  const w = new Float64Array(4)
  const tet = locator.locate(p[0], p[1], p[2], w)
  if (tet < 0) return null

  const result: Record<string, number[]> = {}
  for (const array of Object.values(pointData)) {
    const nc = array.numComponents
    const values = new Array<number>(nc).fill(0)
    for (let k = 0; k < 4; k++) {
      const idx = locator.tetPoint(tet, k) * nc
      for (let c = 0; c < nc; c++) values[c]! += w[k]! * array.data[idx + c]!
    }
    result[array.name] = values
  }
  return result
}
