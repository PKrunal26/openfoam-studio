// Plane slicing via marching tetrahedra. The cut vertices remember which mesh
// edge they came from (edgeA/edgeB/edgeT), so any point field can be
// interpolated onto the cut afterwards. Pure TypeScript, no vtk.js imports.

import type { VtkCells, VtkDataArray } from './legacyVtkParser'
import { tetrahedralize } from './tetrahedralize'

export interface ContourSurface {
  points: Float32Array
  /** triangles, vtk cell-array layout [3, a, b, c, ...] */
  polys: Uint32Array
  /** per output vertex: source mesh points a→b and the lerp factor t */
  edgeA: Uint32Array
  edgeB: Uint32Array
  edgeT: Float32Array
}

const TET_EDGES: [number, number][] = [
  [0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3],
]

/**
 * Zero-level contour of a per-point scalar over a tet soup. Used by both
 * slicePlane (signed plane distance) and isoSurface (scalar − isoValue).
 */
export function contourTets(
  points: Float32Array,
  tets: Uint32Array,
  values: Float32Array,
): ContourSurface {
  const numPoints = points.length / 3
  const vertexByEdge = new Map<number, number>()
  const outPoints: number[] = []
  const polys: number[] = []
  const edgeA: number[] = []
  const edgeB: number[] = []
  const edgeT: number[] = []

  const cutVertex = (a: number, b: number): number => {
    const key = a < b ? a * numPoints + b : b * numPoints + a
    const existing = vertexByEdge.get(key)
    if (existing !== undefined) return existing
    const va = values[a]!
    const vb = values[b]!
    const t = va / (va - vb)
    const idx = outPoints.length / 3
    outPoints.push(
      points[a * 3]! + t * (points[b * 3]! - points[a * 3]!),
      points[a * 3 + 1]! + t * (points[b * 3 + 1]! - points[a * 3 + 1]!),
      points[a * 3 + 2]! + t * (points[b * 3 + 2]! - points[a * 3 + 2]!),
    )
    edgeA.push(a)
    edgeB.push(b)
    edgeT.push(t)
    vertexByEdge.set(key, idx)
    return idx
  }

  const ids = [0, 0, 0, 0]
  for (let i = 0; i < tets.length; i += 4) {
    ids[0] = tets[i]!
    ids[1] = tets[i + 1]!
    ids[2] = tets[i + 2]!
    ids[3] = tets[i + 3]!

    const pos: number[] = []
    const neg: number[] = []
    for (const id of ids) (values[id]! >= 0 ? pos : neg).push(id)
    if (pos.length === 0 || pos.length === 4) continue

    if (pos.length === 1 || pos.length === 3) {
      // Lone vertex on one side → single triangle.
      const lone = pos.length === 1 ? pos[0]! : neg[0]!
      const rest = pos.length === 1 ? neg : pos
      polys.push(3, cutVertex(lone, rest[0]!), cutVertex(lone, rest[1]!), cutVertex(lone, rest[2]!))
    } else {
      // 2/2 split → quad across four edges, fanned into two triangles.
      const [a, b] = pos as [number, number]
      const [c, d] = neg as [number, number]
      const e0 = cutVertex(a, c)
      const e1 = cutVertex(a, d)
      const e2 = cutVertex(b, d)
      const e3 = cutVertex(b, c)
      polys.push(3, e0, e1, e2, 3, e0, e2, e3)
    }
  }

  return {
    points: Float32Array.from(outPoints),
    polys: Uint32Array.from(polys),
    edgeA: Uint32Array.from(edgeA),
    edgeB: Uint32Array.from(edgeB),
    edgeT: Float32Array.from(edgeT),
  }
}

export function slicePlane(
  points: Float32Array,
  cells: VtkCells,
  origin: [number, number, number],
  normal: [number, number, number],
  precomputedTets?: Uint32Array,
): ContourSurface {
  const tets = precomputedTets ?? tetrahedralize(cells).tets
  const numPoints = points.length / 3
  const values = new Float32Array(numPoints)
  for (let i = 0; i < numPoints; i++) {
    values[i] =
      (points[i * 3]! - origin[0]) * normal[0] +
      (points[i * 3 + 1]! - origin[1]) * normal[1] +
      (points[i * 3 + 2]! - origin[2]) * normal[2]
  }
  return contourTets(points, tets, values)
}

/** Interpolates a point-data field onto a contour surface's vertices. */
export function interpolateField(
  array: VtkDataArray,
  surf: ContourSurface,
): { numComponents: number; data: Float32Array } {
  const nc = array.numComponents
  const n = surf.edgeA.length
  const out = new Float32Array(n * nc)
  for (let i = 0; i < n; i++) {
    const a = surf.edgeA[i]!
    const b = surf.edgeB[i]!
    const t = surf.edgeT[i]!
    for (let c = 0; c < nc; c++) {
      out[i * nc + c] = array.data[a * nc + c]! * (1 - t) + array.data[b * nc + c]! * t
    }
  }
  return { numComponents: nc, data: out }
}
