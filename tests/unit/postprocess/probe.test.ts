import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseLegacyVtk, type VtkCells, type VtkDataArray } from '../../../renderer/lib/vtk/legacyVtkParser'
import { probePoint } from '../../../renderer/lib/vtk/probe'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = (rel: string) =>
  fs.readFileSync(path.join(here, '..', '..', 'fixtures', 'vtk', rel), 'utf8')

function unitHex(): { points: Float32Array; cells: VtkCells } {
  return {
    points: new Float32Array([
      0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
      0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
    ]),
    cells: {
      connectivity: new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7]),
      offsets: new Uint32Array([0, 8]),
      types: new Uint8Array([12]),
    },
  }
}

describe('probePoint', () => {
  it('interpolates a linear scalar field exactly', () => {
    const { points, cells } = unitHex()
    // T = z at the corners → T(0.5,0.5,0.25) = 0.25
    const T: VtkDataArray = {
      name: 'T', numComponents: 1, numTuples: 8,
      data: new Float32Array([0, 0, 0, 0, 1, 1, 1, 1]),
    }
    const result = probePoint(points, cells, { T }, [0.5, 0.5, 0.25])
    expect(result).not.toBeNull()
    expect(result!['T']![0]).toBeCloseTo(0.25, 6)
  })

  it('interpolates vector fields component-wise', () => {
    const { points, cells } = unitHex()
    const U: VtkDataArray = {
      name: 'U', numComponents: 3, numTuples: 8,
      // U = (x, 2y, 0) at the corners
      data: new Float32Array([
        0, 0, 0, 1, 0, 0, 1, 2, 0, 0, 2, 0,
        0, 0, 0, 1, 0, 0, 1, 2, 0, 0, 2, 0,
      ]),
    }
    const result = probePoint(points, cells, { U }, [0.25, 0.5, 0.5])
    expect(result!['U']![0]).toBeCloseTo(0.25, 5)
    expect(result!['U']![1]).toBeCloseTo(1.0, 5)
    expect(result!['U']![2]).toBeCloseTo(0, 6)
  })

  it('returns null outside the mesh', () => {
    const { points, cells } = unitHex()
    expect(probePoint(points, cells, {}, [5, 5, 5])).toBeNull()
  })

  it('reads physical values from the solved cavity', () => {
    const ds = parseLegacyVtk(fixture('cavity_10.vtk'))
    const result = probePoint(ds.points, ds.cells!, ds.pointData, [0.05, 0.05, 0.005])
    expect(result).not.toBeNull()
    expect(Object.keys(result!).sort()).toEqual(['U', 'epsilon', 'k', 'nut', 'p'])
    const mag = Math.hypot(...result!['U']!)
    expect(mag).toBeGreaterThan(0)
    expect(mag).toBeLessThan(1)
  })
})
