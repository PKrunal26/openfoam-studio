import { describe, it, expect } from 'vitest'
import type { VtkDataArray } from '../../../renderer/lib/vtk/legacyVtkParser'
import { extractComponent, computeRange, VECTOR_MAGNITUDE } from '../../../renderer/lib/vtk/fieldStats'

const vec: VtkDataArray = {
  name: 'U',
  numComponents: 3,
  numTuples: 3,
  data: new Float32Array([3, 4, 0, 0, 0, 0, 1, 2, 2]),
}

const scalar: VtkDataArray = {
  name: 'p',
  numComponents: 1,
  numTuples: 4,
  data: new Float32Array([-1, 0.5, 2, 0]),
}

describe('extractComponent', () => {
  it('magnitude of a vector field', () => {
    const m = extractComponent(vec, VECTOR_MAGNITUDE)
    expect(Array.from(m)).toEqual([5, 0, 3])
  })

  it('individual x/y/z components', () => {
    expect(Array.from(extractComponent(vec, 0))).toEqual([3, 0, 1])
    expect(Array.from(extractComponent(vec, 1))).toEqual([4, 0, 2])
    expect(Array.from(extractComponent(vec, 2))).toEqual([0, 0, 2])
  })

  it('scalar field passes through regardless of requested component', () => {
    expect(Array.from(extractComponent(scalar, VECTOR_MAGNITUDE))).toEqual([-1, 0.5, 2, 0])
    expect(Array.from(extractComponent(scalar, 0))).toEqual([-1, 0.5, 2, 0])
  })
})

describe('computeRange', () => {
  it('returns [min, max]', () => {
    expect(computeRange(new Float32Array([-1, 0.5, 2, 0]))).toEqual([-1, 2])
  })

  it('ignores NaN values', () => {
    expect(computeRange(new Float32Array([NaN, 1, 3]))).toEqual([1, 3])
  })

  it('degenerate constant field still yields a usable range', () => {
    const [lo, hi] = computeRange(new Float32Array([7, 7, 7]))
    expect(lo).toBe(7)
    expect(hi).toBeGreaterThan(lo) // padded so color mapping never divides by zero
  })

  it('empty input yields [0, 1]', () => {
    expect(computeRange(new Float32Array(0))).toEqual([0, 1])
  })
})
