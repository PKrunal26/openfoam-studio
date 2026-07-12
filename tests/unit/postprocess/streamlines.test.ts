import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseLegacyVtk, type VtkCells, type VtkDataArray } from '../../../renderer/lib/vtk/legacyVtkParser'
import { traceStreamlines, makeLineSeeds } from '../../../renderer/lib/vtk/streamlines'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = (rel: string) =>
  fs.readFileSync(path.join(here, '..', '..', 'fixtures', 'vtk', rel), 'utf8')

function twoHexGrid(): { points: Float32Array; cells: VtkCells } {
  return {
    points: new Float32Array([
      0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
      0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
      2, 0, 0, 2, 1, 0, 2, 0, 1, 2, 1, 1,
    ]),
    cells: {
      connectivity: new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 1, 8, 9, 2, 5, 10, 11, 6]),
      offsets: new Uint32Array([0, 8, 16]),
      types: new Uint8Array([12, 12]),
    },
  }
}

function uniformU(numPoints: number, v: [number, number, number]): VtkDataArray {
  const data = new Float32Array(numPoints * 3)
  for (let i = 0; i < numPoints; i++) {
    data[i * 3] = v[0]
    data[i * 3 + 1] = v[1]
    data[i * 3 + 2] = v[2]
  }
  return { name: 'U', numComponents: 3, numTuples: numPoints, data }
}

describe('makeLineSeeds', () => {
  it('produces n evenly spaced points', () => {
    const seeds = makeLineSeeds([0, 0, 0], [1, 0, 0], 5)
    expect(seeds.length).toBe(15)
    expect(seeds[0]).toBe(0)
    expect(seeds[6]).toBeCloseTo(0.5)
    expect(seeds[12]).toBe(1)
  })

  it('single seed sits at the midpoint', () => {
    const seeds = makeLineSeeds([0, 0, 0], [1, 0, 0], 1)
    expect(Array.from(seeds)).toEqual([0.5, 0, 0])
  })
})

describe('traceStreamlines', () => {
  it('uniform +x flow: line runs from seed to the +x boundary', () => {
    const { points, cells } = twoHexGrid()
    const U = uniformU(12, [1, 0, 0])
    const res = traceStreamlines(points, cells, U, new Float32Array([0.2, 0.5, 0.5]), {
      bothDirections: false,
    })
    expect(res.lines.length).toBeGreaterThan(0)
    const n = res.points.length / 3
    const last = [res.points[(n - 1) * 3]!, res.points[(n - 1) * 3 + 1]!, res.points[(n - 1) * 3 + 2]!]
    expect(last[0]).toBeGreaterThan(1.9) // reached the far wall
    expect(last[1]).toBeCloseTo(0.5, 4)
    expect(last[2]).toBeCloseTo(0.5, 4)
  })

  it('both directions: line spans the whole domain through the seed', () => {
    const { points, cells } = twoHexGrid()
    const U = uniformU(12, [1, 0, 0])
    const res = traceStreamlines(points, cells, U, new Float32Array([1.0, 0.5, 0.5]), {
      bothDirections: true,
    })
    let minX = Infinity
    let maxX = -Infinity
    for (let i = 0; i < res.points.length; i += 3) {
      minX = Math.min(minX, res.points[i]!)
      maxX = Math.max(maxX, res.points[i]!)
    }
    expect(minX).toBeLessThan(0.1)
    expect(maxX).toBeGreaterThan(1.9)
  })

  it('zero velocity → no lines', () => {
    const { points, cells } = twoHexGrid()
    const U = uniformU(12, [0, 0, 0])
    const res = traceStreamlines(points, cells, U, new Float32Array([0.5, 0.5, 0.5]), {})
    expect(res.lines.length).toBe(0)
  })

  it('seed outside the domain → no lines', () => {
    const { points, cells } = twoHexGrid()
    const U = uniformU(12, [1, 0, 0])
    const res = traceStreamlines(points, cells, U, new Float32Array([10, 10, 10]), {})
    expect(res.lines.length).toBe(0)
  })

  it('scalars carry velocity magnitude along the line', () => {
    const { points, cells } = twoHexGrid()
    const U = uniformU(12, [2, 0, 0])
    const res = traceStreamlines(points, cells, U, new Float32Array([0.2, 0.5, 0.5]), {
      bothDirections: false,
    })
    for (const s of res.scalars) expect(s).toBeCloseTo(2, 4)
  })

  it('cavity: rake of seeds produces closed-loop-ish vortex lines inside bounds', () => {
    const ds = parseLegacyVtk(fixture('cavity_10.vtk'))
    const seeds = makeLineSeeds([0.05, 0.02, 0.005], [0.05, 0.08, 0.005], 5)
    const res = traceStreamlines(ds.points, ds.cells!, ds.pointData['U']!, seeds, {
      bothDirections: true,
    })
    expect(res.lines.length).toBeGreaterThan(0)
    // all integrated points stay inside the cavity bounds (with eps slack)
    for (let i = 0; i < res.points.length; i += 3) {
      expect(res.points[i]).toBeGreaterThanOrEqual(-1e-6)
      expect(res.points[i]).toBeLessThanOrEqual(0.1 + 1e-6)
      expect(res.points[i + 1]).toBeGreaterThanOrEqual(-1e-6)
      expect(res.points[i + 1]).toBeLessThanOrEqual(0.1 + 1e-6)
    }
    // the primary vortex should carry lines through a decent arc — expect a
    // few hundred integrated points across 5 seeds
    expect(res.points.length / 3).toBeGreaterThan(100)
  })
})
