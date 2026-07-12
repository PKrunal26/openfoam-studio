// Streamline tracing through the velocity field of an unstructured grid:
// tet decomposition + uniform-grid point locator + barycentric interpolation
// + RK4 integration. Pure TypeScript, no vtk.js imports.

import type { VtkCells, VtkDataArray } from './legacyVtkParser'
import { tetrahedralize } from './tetrahedralize'
import { TetLocator } from './tetLocator'

export interface StreamlineOptions {
  /** integration step; defaults to bboxDiagonal / 500 */
  stepSize?: number
  /** max RK4 steps per direction (default 1000) */
  maxSteps?: number
  /** integrate upstream as well (default true) */
  bothDirections?: boolean
}

export interface StreamlineResult {
  points: Float32Array
  /** vtk cell-array layout, one entry per polyline [n, ids...] */
  lines: Uint32Array
  /** |U| at every output point (for coloring) */
  scalars: Float32Array
}

type Vec3 = [number, number, number]

/** n seed points evenly spaced on the segment p0→p1 (midpoint when n = 1). */
export function makeLineSeeds(p0: Vec3, p1: Vec3, n: number): Float32Array {
  const out = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1)
    out[i * 3] = p0[0] + t * (p1[0] - p0[0])
    out[i * 3 + 1] = p0[1] + t * (p1[1] - p0[1])
    out[i * 3 + 2] = p0[2] + t * (p1[2] - p0[2])
  }
  return out
}

export function traceStreamlines(
  points: Float32Array,
  cells: VtkCells,
  velocity: VtkDataArray,
  seeds: Float32Array,
  options: StreamlineOptions,
  precomputedTets?: Uint32Array,
): StreamlineResult {
  const tets = precomputedTets ?? tetrahedralize(cells).tets
  const locator = new TetLocator(points, tets)
  const h = options.stepSize ?? locator.diagonal / 500
  const maxSteps = options.maxSteps ?? 1000
  const both = options.bothDirections ?? true
  const U = velocity.data
  const w = new Float64Array(4)

  // |U| ceiling for the stagnation cutoff
  let vmax = 0
  for (let i = 0; i < velocity.numTuples; i++) {
    const m = Math.hypot(U[i * 3]!, U[i * 3 + 1]!, U[i * 3 + 2]!)
    if (m > vmax) vmax = m
  }
  const minSpeed = Math.max(vmax * 1e-4, 1e-12)

  const sample = (px: number, py: number, pz: number): Vec3 | null => {
    const t = locator.locate(px, py, pz, w)
    if (t < 0) return null
    let vx = 0
    let vy = 0
    let vz = 0
    for (let k = 0; k < 4; k++) {
      const p = locator.tetPoint(t, k) * 3
      vx += w[k]! * U[p]!
      vy += w[k]! * U[p + 1]!
      vz += w[k]! * U[p + 2]!
    }
    return [vx, vy, vz]
  }

  const integrate = (sx: number, sy: number, sz: number, dir: 1 | -1): number[] => {
    const line: number[] = []
    let x = sx
    let y = sy
    let z = sz
    for (let step = 0; step < maxSteps; step++) {
      const k1 = sample(x, y, z)
      if (!k1) break
      const speed = Math.hypot(k1[0], k1[1], k1[2])
      if (speed < minSpeed) break
      const s = (dir * h) / speed // arc-length-ish parametrisation
      const k2 = sample(x + 0.5 * s * k1[0], y + 0.5 * s * k1[1], z + 0.5 * s * k1[2])
      if (!k2) break
      const k3 = sample(x + 0.5 * s * k2[0], y + 0.5 * s * k2[1], z + 0.5 * s * k2[2])
      if (!k3) break
      const k4 = sample(x + s * k3[0], y + s * k3[1], z + s * k3[2])
      if (!k4) break
      x += (s / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])
      y += (s / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
      z += (s / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])
      const v = sample(x, y, z)
      if (!v) break
      line.push(x, y, z, Math.hypot(v[0], v[1], v[2]))
    }
    return line
  }

  const outPoints: number[] = []
  const outScalars: number[] = []
  const outLines: number[] = []

  const numSeeds = seeds.length / 3
  for (let sIdx = 0; sIdx < numSeeds; sIdx++) {
    const sx = seeds[sIdx * 3]!
    const sy = seeds[sIdx * 3 + 1]!
    const sz = seeds[sIdx * 3 + 2]!
    const v0 = sample(sx, sy, sz)
    if (!v0) continue

    const fwd = integrate(sx, sy, sz, 1)
    const bwd = both ? integrate(sx, sy, sz, -1) : []

    // upstream (reversed) → seed → downstream
    const combined: number[] = []
    for (let i = bwd.length - 4; i >= 0; i -= 4) {
      combined.push(bwd[i]!, bwd[i + 1]!, bwd[i + 2]!, bwd[i + 3]!)
    }
    combined.push(sx, sy, sz, Math.hypot(v0[0], v0[1], v0[2]))
    for (let i = 0; i < fwd.length; i += 4) {
      combined.push(fwd[i]!, fwd[i + 1]!, fwd[i + 2]!, fwd[i + 3]!)
    }

    const n = combined.length / 4
    if (n < 2) continue
    const base = outPoints.length / 3
    outLines.push(n)
    for (let i = 0; i < n; i++) {
      outPoints.push(combined[i * 4]!, combined[i * 4 + 1]!, combined[i * 4 + 2]!)
      outScalars.push(combined[i * 4 + 3]!)
      outLines.push(base + i)
    }
  }

  return {
    points: Float32Array.from(outPoints),
    lines: Uint32Array.from(outLines),
    scalars: Float32Array.from(outScalars),
  }
}
