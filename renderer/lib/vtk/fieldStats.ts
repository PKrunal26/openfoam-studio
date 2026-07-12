// Component extraction and range computation for parsed VTK field arrays.
// Pure TypeScript, no vtk.js imports.

import type { VtkDataArray } from './legacyVtkParser'

/** Component selector meaning |v| for vector fields. */
export const VECTOR_MAGNITUDE = -1

export type ComponentSelector = typeof VECTOR_MAGNITUDE | 0 | 1 | 2

/**
 * Returns one scalar per tuple: the requested component of a vector field,
 * its magnitude (VECTOR_MAGNITUDE), or the values unchanged for scalars.
 */
export function extractComponent(array: VtkDataArray, component: ComponentSelector): Float32Array {
  const { numComponents, numTuples, data } = array
  if (numComponents === 1) {
    return data instanceof Float32Array ? data : Float32Array.from(data)
  }
  const out = new Float32Array(numTuples)
  if (component === VECTOR_MAGNITUDE) {
    for (let i = 0; i < numTuples; i++) {
      let sq = 0
      for (let c = 0; c < numComponents; c++) {
        const v = data[i * numComponents + c]!
        sq += v * v
      }
      out[i] = Math.sqrt(sq)
    }
  } else {
    const comp = Math.min(component, numComponents - 1)
    for (let i = 0; i < numTuples; i++) out[i] = data[i * numComponents + comp]!
  }
  return out
}

/**
 * [min, max] over the values, NaN-safe. Constant fields are padded so a color
 * transfer function over the range never divides by zero; empty input → [0, 1].
 */
export function computeRange(values: Float32Array): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!
    if (Number.isNaN(v)) continue
    if (v < min) min = v
    if (v > max) max = v
  }
  if (min === Infinity) return [0, 1]
  if (min === max) {
    const pad = Math.abs(min) > 1e-30 ? Math.abs(min) * 1e-6 : 1e-6
    return [min, max + pad]
  }
  return [min, max]
}
