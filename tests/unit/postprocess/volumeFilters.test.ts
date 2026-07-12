import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseLegacyVtk, type VtkCells, type VtkDataArray } from '../../../renderer/lib/vtk/legacyVtkParser'
import { tetrahedralize } from '../../../renderer/lib/vtk/tetrahedralize'
import { slicePlane, interpolateField } from '../../../renderer/lib/vtk/slice'
import { isoSurface } from '../../../renderer/lib/vtk/isoSurface'
import { clipCells } from '../../../renderer/lib/vtk/clip'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = (rel: string) =>
  fs.readFileSync(path.join(here, '..', '..', 'fixtures', 'vtk', rel), 'utf8')

// ── helpers ──────────────────────────────────────────────────────────────────

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

function tetVolume(points: Float32Array, a: number, b: number, c: number, d: number): number {
  const v = (i: number) => [points[i * 3]!, points[i * 3 + 1]!, points[i * 3 + 2]!]
  const [pa, pb, pc, pd] = [v(a), v(b), v(c), v(d)]
  const ab = [pb[0]! - pa[0]!, pb[1]! - pa[1]!, pb[2]! - pa[2]!]
  const ac = [pc[0]! - pa[0]!, pc[1]! - pa[1]!, pc[2]! - pa[2]!]
  const ad = [pd[0]! - pa[0]!, pd[1]! - pa[1]!, pd[2]! - pa[2]!]
  const det =
    ab[0]! * (ac[1]! * ad[2]! - ac[2]! * ad[1]!) -
    ab[1]! * (ac[0]! * ad[2]! - ac[2]! * ad[0]!) +
    ab[2]! * (ac[0]! * ad[1]! - ac[1]! * ad[0]!)
  return Math.abs(det) / 6
}

function totalTetVolume(points: Float32Array, tets: Uint32Array): number {
  let vol = 0
  for (let i = 0; i < tets.length; i += 4) {
    vol += tetVolume(points, tets[i]!, tets[i + 1]!, tets[i + 2]!, tets[i + 3]!)
  }
  return vol
}

function triArea(points: Float32Array, polys: Uint32Array): number {
  let area = 0
  for (let i = 0; i < polys.length; i += 4) {
    const [a, b, c] = [polys[i + 1]!, polys[i + 2]!, polys[i + 3]!]
    const p = (k: number) => [points[k * 3]!, points[k * 3 + 1]!, points[k * 3 + 2]!]
    const [pa, pb, pc] = [p(a), p(b), p(c)]
    const u = [pb[0]! - pa[0]!, pb[1]! - pa[1]!, pb[2]! - pa[2]!]
    const v = [pc[0]! - pa[0]!, pc[1]! - pa[1]!, pc[2]! - pa[2]!]
    const cx = u[1]! * v[2]! - u[2]! * v[1]!
    const cy = u[2]! * v[0]! - u[0]! * v[2]!
    const cz = u[0]! * v[1]! - u[1]! * v[0]!
    area += Math.sqrt(cx * cx + cy * cy + cz * cz) / 2
  }
  return area
}

// ── tetrahedralize ───────────────────────────────────────────────────────────

describe('tetrahedralize', () => {
  it('hex → 6 tets filling the cube exactly', () => {
    const { points, cells } = unitHex()
    const { tets, owner } = tetrahedralize(cells)
    expect(tets.length).toBe(6 * 4)
    expect(totalTetVolume(points, tets)).toBeCloseTo(1, 10)
    expect(Array.from(owner)).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('tet passes through unchanged', () => {
    const cells: VtkCells = {
      connectivity: new Uint32Array([0, 1, 2, 3]),
      offsets: new Uint32Array([0, 4]),
      types: new Uint8Array([10]),
    }
    const { tets } = tetrahedralize(cells)
    expect(Array.from(tets)).toEqual([0, 1, 2, 3])
  })

  it('wedge → 3 tets with the prism volume', () => {
    const points = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      0, 0, 1, 1, 0, 1, 0, 1, 1,
    ])
    const cells: VtkCells = {
      connectivity: new Uint32Array([0, 1, 2, 3, 4, 5]),
      offsets: new Uint32Array([0, 6]),
      types: new Uint8Array([13]),
    }
    const { tets } = tetrahedralize(cells)
    expect(tets.length).toBe(3 * 4)
    expect(totalTetVolume(points, tets)).toBeCloseTo(0.5, 10)
  })

  it('pyramid → 2 tets with the pyramid volume', () => {
    const points = new Float32Array([
      0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
      0.5, 0.5, 1,
    ])
    const cells: VtkCells = {
      connectivity: new Uint32Array([0, 1, 2, 3, 4]),
      offsets: new Uint32Array([0, 5]),
      types: new Uint8Array([14]),
    }
    const { tets } = tetrahedralize(cells)
    expect(tets.length).toBe(2 * 4)
    expect(totalTetVolume(points, tets)).toBeCloseTo(1 / 3, 10)
  })

  it('cavity mesh: 400 hexes → 2400 tets covering the domain volume', () => {
    const ds = parseLegacyVtk(fixture('cavity_10.vtk'))
    const { tets } = tetrahedralize(ds.cells!)
    expect(tets.length).toBe(400 * 6 * 4)
    // Domain is 0.1 × 0.1 × 0.01 m
    expect(totalTetVolume(ds.points, tets)).toBeCloseTo(1e-4, 8)
  })
})

// ── slicePlane ───────────────────────────────────────────────────────────────

describe('slicePlane', () => {
  it('mid-plane through a unit cube has area 1', () => {
    const { points, cells } = unitHex()
    const surf = slicePlane(points, cells, [0.5, 0.5, 0.5], [0, 0, 1])
    expect(surf.polys.length).toBeGreaterThan(0)
    expect(triArea(surf.points, surf.polys)).toBeCloseTo(1, 6)
    // every sliced vertex lies on the plane
    for (let i = 0; i < surf.points.length; i += 3) {
      expect(surf.points[i + 2]).toBeCloseTo(0.5, 6)
    }
  })

  it('interpolates point fields onto the cut', () => {
    const { points, cells } = unitHex()
    const surf = slicePlane(points, cells, [0.5, 0.5, 0.5], [0, 0, 1])
    // field T = z at each of the 8 cube corners
    const T: VtkDataArray = {
      name: 'T',
      numComponents: 1,
      numTuples: 8,
      data: new Float32Array([0, 0, 0, 0, 1, 1, 1, 1]),
    }
    const vals = interpolateField(T, surf)
    for (const v of vals.data) expect(v).toBeCloseTo(0.5, 6)
  })

  it('plane outside the domain → empty surface', () => {
    const { points, cells } = unitHex()
    const surf = slicePlane(points, cells, [0, 0, 5], [0, 0, 1])
    expect(surf.polys.length).toBe(0)
  })

  it('cavity mid-depth slice covers the square cross-section', () => {
    const ds = parseLegacyVtk(fixture('cavity_10.vtk'))
    const surf = slicePlane(ds.points, ds.cells!, [0.05, 0.05, 0.005], [0, 0, 1])
    expect(triArea(surf.points, surf.polys)).toBeCloseTo(0.01, 5)
  })
})

// ── isoSurface ───────────────────────────────────────────────────────────────

describe('isoSurface', () => {
  it('iso of scalar=z at 0.5 in a unit cube is the mid-plane', () => {
    const { points, cells } = unitHex()
    const scalars = new Float32Array([0, 0, 0, 0, 1, 1, 1, 1])
    const surf = isoSurface(points, cells, scalars, 0.5)
    expect(triArea(surf.points, surf.polys)).toBeCloseTo(1, 6)
    for (let i = 0; i < surf.points.length; i += 3) {
      expect(surf.points[i + 2]).toBeCloseTo(0.5, 6)
    }
  })

  it('iso value outside the data range → empty', () => {
    const { points, cells } = unitHex()
    const scalars = new Float32Array([0, 0, 0, 0, 1, 1, 1, 1])
    expect(isoSurface(points, cells, scalars, 2).polys.length).toBe(0)
  })
})

// ── clipCells ────────────────────────────────────────────────────────────────

describe('clipCells', () => {
  it('keeps cells whose centroid is on the +normal side', () => {
    const { points, cells } = twoHexGrid()
    const kept = clipCells(points, cells, [1, 0.5, 0.5], [1, 0, 0])
    expect(kept.types.length).toBe(1)
    // second hex (x in 1..2) survives
    expect(Array.from(kept.connectivity)).toEqual([1, 8, 9, 2, 5, 10, 11, 6])
  })

  it('clip plane outside keeps everything / nothing', () => {
    const { points, cells } = twoHexGrid()
    expect(clipCells(points, cells, [-1, 0, 0], [1, 0, 0]).types.length).toBe(2)
    expect(clipCells(points, cells, [5, 0, 0], [1, 0, 0]).types.length).toBe(0)
  })

  it('cavity clipped at x-center keeps about half the cells', () => {
    const ds = parseLegacyVtk(fixture('cavity_10.vtk'))
    const kept = clipCells(ds.points, ds.cells!, [0.05, 0, 0], [1, 0, 0])
    expect(kept.types.length).toBe(200)
  })
})
