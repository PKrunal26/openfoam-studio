import { describe, it, expect } from 'vitest'
import type { VtkDataArray } from '../../../renderer/lib/vtk/legacyVtkParser'
import { sampleVectorGlyphs } from '../../../renderer/lib/vtk/glyphs'

const points = new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0])
const U: VtkDataArray = {
  name: 'U',
  numComponents: 3,
  numTuples: 4,
  data: new Float32Array([0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 3]),
}

describe('sampleVectorGlyphs', () => {
  it('stride 1 keeps every point with its vector and magnitude', () => {
    const g = sampleVectorGlyphs(points, U, 1)
    expect(g.positions.length).toBe(12)
    expect(Array.from(g.vectors.slice(3, 6))).toEqual([1, 0, 0])
    expect(Array.from(g.magnitudes)).toEqual([0, 1, 2, 3])
  })

  it('stride 2 keeps every other point', () => {
    const g = sampleVectorGlyphs(points, U, 2)
    expect(g.positions.length).toBe(6)
    expect(Array.from(g.positions)).toEqual([0, 0, 0, 2, 0, 0])
    expect(Array.from(g.magnitudes)).toEqual([0, 2])
  })

  it('stride larger than the point count keeps the first point', () => {
    const g = sampleVectorGlyphs(points, U, 99)
    expect(g.positions.length).toBe(3)
  })
})
