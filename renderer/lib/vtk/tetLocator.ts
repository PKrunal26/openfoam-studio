// Uniform-grid spatial index over a tetrahedral decomposition: point location
// and barycentric weights for interpolation. Shared by streamlines and probe.
// Pure TypeScript, no vtk.js imports.

type Vec3 = [number, number, number]

/** Uniform-grid spatial index over tets for point location. */
export class TetLocator {
  private res: number
  private bmin: Vec3 = [Infinity, Infinity, Infinity]
  private bmax: Vec3 = [-Infinity, -Infinity, -Infinity]
  private inv: Vec3 = [0, 0, 0]
  private bins: Int32Array[] // tet indices per bin

  constructor(
    private points: Float32Array,
    private tets: Uint32Array,
  ) {
    for (let i = 0; i < points.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        const v = points[i + a]!
        if (v < this.bmin[a]!) this.bmin[a] = v
        if (v > this.bmax[a]!) this.bmax[a] = v
      }
    }
    const numTets = tets.length / 4
    this.res = Math.max(1, Math.min(48, Math.round(Math.cbrt(numTets))))
    for (let a = 0; a < 3; a++) {
      const span = this.bmax[a]! - this.bmin[a]!
      this.inv[a] = span > 0 ? this.res / span : 0
    }

    const lists: number[][] = Array.from({ length: this.res ** 3 }, () => [])
    const clamp = (v: number) => Math.max(0, Math.min(this.res - 1, v))
    for (let t = 0; t < numTets; t++) {
      let lo: Vec3 = [Infinity, Infinity, Infinity]
      let hi: Vec3 = [-Infinity, -Infinity, -Infinity]
      for (let k = 0; k < 4; k++) {
        const p = tets[t * 4 + k]! * 3
        for (let a = 0; a < 3; a++) {
          const v = points[p + a]!
          if (v < lo[a]!) lo[a] = v
          if (v > hi[a]!) hi[a] = v
        }
      }
      const i0 = clamp(Math.floor((lo[0]! - this.bmin[0]!) * this.inv[0]!))
      const i1 = clamp(Math.floor((hi[0]! - this.bmin[0]!) * this.inv[0]!))
      const j0 = clamp(Math.floor((lo[1]! - this.bmin[1]!) * this.inv[1]!))
      const j1 = clamp(Math.floor((hi[1]! - this.bmin[1]!) * this.inv[1]!))
      const k0 = clamp(Math.floor((lo[2]! - this.bmin[2]!) * this.inv[2]!))
      const k1 = clamp(Math.floor((hi[2]! - this.bmin[2]!) * this.inv[2]!))
      for (let i = i0; i <= i1; i++)
        for (let j = j0; j <= j1; j++)
          for (let k = k0; k <= k1; k++) lists[(i * this.res + j) * this.res + k]!.push(t)
    }
    this.bins = lists.map((l) => Int32Array.from(l))
  }

  get diagonal(): number {
    const dx = this.bmax[0]! - this.bmin[0]!
    const dy = this.bmax[1]! - this.bmin[1]!
    const dz = this.bmax[2]! - this.bmin[2]!
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }

  /**
   * Finds the tet containing p; returns barycentric weights in `weights`
   * (length 4) and the tet index, or -1 when outside the mesh.
   */
  locate(px: number, py: number, pz: number, weights: Float64Array): number {
    if (
      px < this.bmin[0]! || px > this.bmax[0]! ||
      py < this.bmin[1]! || py > this.bmax[1]! ||
      pz < this.bmin[2]! || pz > this.bmax[2]!
    ) return -1
    const clamp = (v: number) => Math.max(0, Math.min(this.res - 1, v))
    const i = clamp(Math.floor((px - this.bmin[0]!) * this.inv[0]!))
    const j = clamp(Math.floor((py - this.bmin[1]!) * this.inv[1]!))
    const k = clamp(Math.floor((pz - this.bmin[2]!) * this.inv[2]!))
    const bin = this.bins[(i * this.res + j) * this.res + k]!
    for (const t of bin) {
      if (this.barycentric(t, px, py, pz, weights)) return t
    }
    return -1
  }

  private barycentric(t: number, px: number, py: number, pz: number, w: Float64Array): boolean {
    const P = this.points
    const i0 = this.tets[t * 4]! * 3
    const i1 = this.tets[t * 4 + 1]! * 3
    const i2 = this.tets[t * 4 + 2]! * 3
    const i3 = this.tets[t * 4 + 3]! * 3
    const ax = P[i0]!, ay = P[i0 + 1]!, az = P[i0 + 2]!
    const b0 = P[i1]! - ax, b1 = P[i1 + 1]! - ay, b2 = P[i1 + 2]! - az
    const c0 = P[i2]! - ax, c1 = P[i2 + 1]! - ay, c2 = P[i2 + 2]! - az
    const d0 = P[i3]! - ax, d1 = P[i3 + 1]! - ay, d2 = P[i3 + 2]! - az
    const det =
      b0 * (c1 * d2 - c2 * d1) - b1 * (c0 * d2 - c2 * d0) + b2 * (c0 * d1 - c1 * d0)
    if (Math.abs(det) < 1e-30) return false
    const px0 = px - ax, py0 = py - ay, pz0 = pz - az
    // Cramer's rule
    const wb =
      (px0 * (c1 * d2 - c2 * d1) - py0 * (c0 * d2 - c2 * d0) + pz0 * (c0 * d1 - c1 * d0)) / det
    const wc =
      (b0 * (py0 * d2 - pz0 * d1) - b1 * (px0 * d2 - pz0 * d0) + b2 * (px0 * d1 - py0 * d0)) / det
    const wd =
      (b0 * (c1 * pz0 - c2 * py0) - b1 * (c0 * pz0 - c2 * px0) + b2 * (c0 * py0 - c1 * px0)) / det
    const wa = 1 - wb - wc - wd
    const eps = -1e-8
    if (wa < eps || wb < eps || wc < eps || wd < eps) return false
    w[0] = wa
    w[1] = wb
    w[2] = wc
    w[3] = wd
    return true
  }

  tetPoint(t: number, k: number): number {
    return this.tets[t * 4 + k]!
  }
}
