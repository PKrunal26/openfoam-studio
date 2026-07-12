import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseLegacyVtk } from '../../../renderer/lib/vtk/legacyVtkParser'
import { extractExternalSurface } from '../../../renderer/lib/vtk/surfaceExtract'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = (rel: string) =>
  fs.readFileSync(path.join(here, '..', '..', 'fixtures', 'vtk', rel), 'utf8')

function makeTwoHexGrid() {
  // Two unit hexes sharing the x=1 face (12 points, 2 cells).
  const points = new Float32Array([
    0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
    0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
    2, 0, 0, 2, 1, 0, 2, 0, 1, 2, 1, 1,
  ])
  const connectivity = new Uint32Array([
    0, 1, 2, 3, 4, 5, 6, 7,
    1, 8, 9, 2, 5, 10, 11, 6,
  ])
  const offsets = new Uint32Array([0, 8, 16])
  const types = new Uint8Array([12, 12])
  return { points, cells: { connectivity, offsets, types } }
}

describe('extractExternalSurface', () => {
  it('two adjacent hexes: shared face removed, 10 quads remain', () => {
    const { points, cells } = makeTwoHexGrid()
    const surf = extractExternalSurface(points, cells)
    expect(surf.numFaces).toBe(10)
    // vtk layout: every quad is "4 a b c d" → 5 entries per face
    expect(surf.polys.length).toBe(50)
  })

  it('single tetrahedron keeps all 4 triangle faces', () => {
    const points = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1])
    const cells = {
      connectivity: new Uint32Array([0, 1, 2, 3]),
      offsets: new Uint32Array([0, 4]),
      types: new Uint8Array([10]),
    }
    const surf = extractExternalSurface(points, cells)
    expect(surf.numFaces).toBe(4)
    expect(surf.polys.length).toBe(16) // 4 faces × (1 count + 3 ids)
  })

  it('records the owning cell of every external face', () => {
    const { points, cells } = makeTwoHexGrid()
    const surf = extractExternalSurface(points, cells)
    expect(surf.faceOwnerCells.length).toBe(10)
    const owners = new Set(Array.from(surf.faceOwnerCells))
    expect(owners).toEqual(new Set([0, 1]))
  })

  it('cavity internal mesh (20×20×1 hexes) → 880 external quads', () => {
    const ds = parseLegacyVtk(fixture('cavity_10.vtk'))
    const surf = extractExternalSurface(ds.points, ds.cells!)
    // 2 × (20×20) front/back + 4 × 20 side strips = 880
    expect(surf.numFaces).toBe(880)
  })

  it('throws on unsupported cell types', () => {
    const cells = {
      connectivity: new Uint32Array([0, 1, 2, 3]),
      offsets: new Uint32Array([0, 4]),
      types: new Uint8Array([42]), // VTK_POLYHEDRON — not supported yet
    }
    expect(() => extractExternalSurface(new Float32Array(12), cells)).toThrow(/42/)
  })
})
