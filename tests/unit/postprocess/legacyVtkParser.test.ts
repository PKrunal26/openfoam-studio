import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseLegacyVtk } from '../../../renderer/lib/vtk/legacyVtkParser'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = (rel: string) =>
  fs.readFileSync(path.join(here, '..', '..', 'fixtures', 'vtk', rel), 'utf8')

// ── Minimal handwritten fixtures ─────────────────────────────────────────────

// A single quad in the z=0 plane with one scalar + one vector point field and
// one FIELD-style cell array.
const MINI_POLYDATA = `# vtk DataFile Version 2.0
mini quad POINTS CELLS
ASCII
DATASET POLYDATA
POINTS 4 float
0 0 0 1 0 0
1 1 0
0 1 0
POLYGONS 1 5
4 0 1 2 3
CELL_DATA 1
FIELD attributes 1
p 1 1 float
42.5
POINT_DATA 4
SCALARS T float
LOOKUP_TABLE default
1 2 3 4
VECTORS U float
0 0 0 1 0 0 1 1 0 0 1 0
`

// Two unit hexes sharing a face, with int + float cell FIELD arrays.
const MINI_UGRID = `# vtk DataFile Version 2.0
mini hexes
ASCII
DATASET UNSTRUCTURED_GRID
POINTS 12 float
0 0 0  1 0 0  1 1 0  0 1 0
0 0 1  1 0 1  1 1 1  0 1 1
2 0 0  2 1 0  2 0 1  2 1 1
CELLS 2 18
8 0 1 2 3 4 5 6 7
8 1 8 9 2 5 10 11 6
CELL_TYPES 2
12 12
CELL_DATA 2
FIELD attributes 2
cellID 1 2 int
0 1
U 3 2 float
1 0 0 0 1 0
`

describe('parseLegacyVtk — minimal polydata', () => {
  it('parses points and polygons', () => {
    const ds = parseLegacyVtk(MINI_POLYDATA)
    expect(ds.type).toBe('polydata')
    expect(ds.numPoints).toBe(4)
    expect(Array.from(ds.points.slice(0, 6))).toEqual([0, 0, 0, 1, 0, 0])
    // vtk cell-array layout: [n, id0..idn-1, ...]
    expect(Array.from(ds.polys!)).toEqual([4, 0, 1, 2, 3])
    expect(ds.numCells).toBe(1)
  })

  it('parses SCALARS + VECTORS point data and FIELD cell data', () => {
    const ds = parseLegacyVtk(MINI_POLYDATA)
    const T = ds.pointData['T']!
    expect(T.numComponents).toBe(1)
    expect(T.numTuples).toBe(4)
    expect(Array.from(T.data)).toEqual([1, 2, 3, 4])
    const U = ds.pointData['U']!
    expect(U.numComponents).toBe(3)
    expect(U.numTuples).toBe(4)
    expect(Array.from(U.data.slice(3, 6))).toEqual([1, 0, 0])
    const p = ds.cellData['p']!
    expect(p.numComponents).toBe(1)
    expect(Array.from(p.data)).toEqual([42.5])
  })

  it('does not confuse keywords inside the title line', () => {
    // Title is "mini quad POINTS CELLS" — must not be treated as sections.
    const ds = parseLegacyVtk(MINI_POLYDATA)
    expect(ds.numPoints).toBe(4)
  })
})

describe('parseLegacyVtk — minimal unstructured grid', () => {
  it('parses cells with offsets and types', () => {
    const ds = parseLegacyVtk(MINI_UGRID)
    expect(ds.type).toBe('unstructuredGrid')
    expect(ds.numPoints).toBe(12)
    expect(ds.numCells).toBe(2)
    const cells = ds.cells!
    expect(Array.from(cells.types)).toEqual([12, 12])
    expect(Array.from(cells.offsets)).toEqual([0, 8, 16])
    expect(Array.from(cells.connectivity.slice(0, 8))).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(Array.from(cells.connectivity.slice(8, 16))).toEqual([1, 8, 9, 2, 5, 10, 11, 6])
  })

  it('parses int FIELD arrays as integer data', () => {
    const ds = parseLegacyVtk(MINI_UGRID)
    const id = ds.cellData['cellID']!
    expect(id.data).toBeInstanceOf(Int32Array)
    expect(Array.from(id.data)).toEqual([0, 1])
    const U = ds.cellData['U']!
    expect(U.numComponents).toBe(3)
    expect(Array.from(U.data)).toEqual([1, 0, 0, 0, 1, 0])
  })
})

describe('parseLegacyVtk — real foamToVTK output (cavity, t=10)', () => {
  it('parses the internal mesh: 882 points, 400 hex cells', () => {
    const ds = parseLegacyVtk(fixture('cavity_10.vtk'))
    expect(ds.type).toBe('unstructuredGrid')
    expect(ds.numPoints).toBe(882)
    expect(ds.numCells).toBe(400)
    expect(ds.cells!.types.every((t) => t === 12)).toBe(true)
  })

  it('exposes the OpenFOAM fields on cell and point data', () => {
    const ds = parseLegacyVtk(fixture('cavity_10.vtk'))
    expect(Object.keys(ds.cellData).sort()).toEqual(
      ['U', 'cellID', 'epsilon', 'k', 'nut', 'p'].sort(),
    )
    expect(Object.keys(ds.pointData).sort()).toEqual(['U', 'epsilon', 'k', 'nut', 'p'].sort())
    expect(ds.pointData['U']!.numComponents).toBe(3)
    expect(ds.pointData['U']!.numTuples).toBe(882)
    expect(ds.pointData['p']!.numComponents).toBe(1)
    expect(ds.cellData['cellID']!.data).toBeInstanceOf(Int32Array)
  })

  it('parses lid velocity: U on the moving wall patch is ~(1,0,0)', () => {
    const ds = parseLegacyVtk(fixture('movingWall/movingWall_10.vtk'))
    expect(ds.type).toBe('polydata')
    expect(ds.numPoints).toBe(42)
    expect(ds.numCells).toBe(20)
    const U = ds.cellData['U']!
    // Every moving-wall face carries the lid velocity (1, 0, 0).
    for (let i = 0; i < U.numTuples; i++) {
      expect(U.data[i * 3]).toBeCloseTo(1, 5)
      expect(U.data[i * 3 + 1]).toBeCloseTo(0, 5)
      expect(U.data[i * 3 + 2]).toBeCloseTo(0, 5)
    }
  })

  it('parses scientific-notation values', () => {
    const ds = parseLegacyVtk(fixture('cavity_10.vtk'))
    const p = ds.pointData['p']!
    // First point-data p value in the fixture is 2.65159e-08.
    expect(p.data[0]).toBeCloseTo(2.65159e-8, 12)
  })
})

describe('parseLegacyVtk — errors', () => {
  it('rejects BINARY files with a clear message', () => {
    const bin = MINI_POLYDATA.replace('ASCII', 'BINARY')
    expect(() => parseLegacyVtk(bin)).toThrow(/binary/i)
  })

  it('rejects unsupported dataset types', () => {
    const sp = MINI_POLYDATA.replace('DATASET POLYDATA', 'DATASET STRUCTURED_POINTS')
    expect(() => parseLegacyVtk(sp)).toThrow(/STRUCTURED_POINTS/)
  })
})
