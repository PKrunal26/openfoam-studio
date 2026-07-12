// Subsampling of mesh points for vector glyphs (arrows). Pure TypeScript.

import type { VtkDataArray } from './legacyVtkParser'

export interface GlyphPoints {
  positions: Float32Array
  vectors: Float32Array
  magnitudes: Float32Array
}

export function sampleVectorGlyphs(
  points: Float32Array,
  vectors: VtkDataArray,
  stride: number,
): GlyphPoints {
  const numPoints = points.length / 3
  const step = Math.max(1, Math.floor(stride))
  const count = Math.ceil(numPoints / step)
  const positions = new Float32Array(count * 3)
  const vecs = new Float32Array(count * 3)
  const magnitudes = new Float32Array(count)
  let o = 0
  for (let i = 0; i < numPoints; i += step) {
    positions[o * 3] = points[i * 3]!
    positions[o * 3 + 1] = points[i * 3 + 1]!
    positions[o * 3 + 2] = points[i * 3 + 2]!
    const vx = vectors.data[i * 3]!
    const vy = vectors.data[i * 3 + 1]!
    const vz = vectors.data[i * 3 + 2]!
    vecs[o * 3] = vx
    vecs[o * 3 + 1] = vy
    vecs[o * 3 + 2] = vz
    magnitudes[o] = Math.hypot(vx, vy, vz)
    o++
  }
  return { positions, vectors: vecs, magnitudes }
}
