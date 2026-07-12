/**
 * VelocitySampler — reads an OpenFOAM ASCII U field file and extracts
 * the u-velocity along the vertical centerline of a structured cavity mesh.
 *
 * Assumptions:
 *  - Single block, uniform structured mesh (nx × ny × 1)
 *  - Cell ordering: index = j * nx + i  (k=0 always)
 *  - ASCII internalField nonuniform List<vector>
 *  - Domain is a square cavity of side `domainSize` metres
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VelocityPoint {
  /** Normalised y coordinate in [0, 1] */
  y: number
  /** u-velocity (x-component) [m/s] */
  u: number
}

export interface MeshParams {
  /** Number of cells in x-direction */
  nx: number
  /** Number of cells in y-direction */
  ny: number
  /** Physical side length of the cavity [m] (e.g., 0.1) */
  domainSize: number
}

// ---------------------------------------------------------------------------
// Internal parsing
// ---------------------------------------------------------------------------

/**
 * Parse the internalField block from an OpenFOAM U field file.
 * Returns [ux, uy, uz] for each cell in storage order.
 */
export function parseVectorField(content: string): [number, number, number][] {
  // Match: internalField nonuniform List<vector> \n COUNT \n ( ... ) ;
  const match = content.match(
    /internalField\s+nonuniform\s+List<vector>\s*\n\s*(\d+)\s*\n\s*\(([\s\S]*?)\)\s*;/
  )
  if (!match) {
    throw new Error(
      'Could not find "internalField nonuniform List<vector>" section in U file. ' +
      'Is this an ASCII U field from a converged OpenFOAM run?'
    )
  }

  const expectedCount = parseInt(match[1]!, 10)
  const body = match[2]!

  const vectors: [number, number, number][] = []
  const vectorRe = /\(\s*([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s*\)/g
  let m: RegExpExecArray | null
  while ((m = vectorRe.exec(body)) !== null) {
    vectors.push([parseFloat(m[1]!), parseFloat(m[2]!), parseFloat(m[3]!)])
  }

  if (vectors.length !== expectedCount) {
    throw new Error(
      `Vector count mismatch: expected ${expectedCount}, parsed ${vectors.length}`
    )
  }

  return vectors
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sample u-velocity along the vertical centerline (x ≈ domainSize/2).
 *
 * For a 20×20 mesh, uses column i = floor(nx/2) - 1 (left-of-centre),
 * which is the closest column to x = domainSize/2.
 * Returns one point per cell row, sorted by ascending y.
 */
export function sampleCenterlineU(
  uFileContent: string,
  params: MeshParams
): VelocityPoint[] {
  const { nx, ny } = params

  if (nx < 2 || ny < 2) {
    throw new Error(`Mesh too coarse: nx=${nx}, ny=${ny}`)
  }

  const vectors = parseVectorField(uFileContent)
  const totalExpected = nx * ny
  if (vectors.length !== totalExpected) {
    throw new Error(
      `Vector count ${vectors.length} doesn't match nx*ny=${totalExpected}. ` +
      `Check mesh params.`
    )
  }

  // For even nx, the true centreline (x = 0.5) falls on a cell face, not a cell centre.
  // We sample the cell centre just left of centre (i = nx/2 - 1):
  //   e.g. nx=20 → i=9, cell centre at x=(9+0.5)/20 = 0.475 (normalised)
  // This 2.5%-of-domain offset is acceptable for a 20-cell mesh and matches
  // how Stage 4 Ghia comparison is validated.
  const iCenter = Math.floor(nx / 2) - 1

  const points: VelocityPoint[] = []
  for (let j = 0; j < ny; j++) {
    const cellIndex = j * nx + iCenter
    const [ux] = vectors[cellIndex]!
    const yNorm = (j + 0.5) / ny
    points.push({ y: yNorm, u: ux })
  }

  return points.sort((a, b) => a.y - b.y)
}

/**
 * Linear interpolation of u at a given normalised y coordinate.
 * Clamps to the boundary values outside the sampled range.
 */
export function interpolateU(points: VelocityPoint[], yNorm: number): number {
  if (points.length === 0) throw new Error('No points to interpolate')
  if (yNorm <= points[0]!.y) return points[0]!.u
  if (yNorm >= points[points.length - 1]!.y) return points[points.length - 1]!.u

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i]!
    const p1 = points[i + 1]!
    if (yNorm >= p0.y && yNorm <= p1.y) {
      const t = (yNorm - p0.y) / (p1.y - p0.y)
      return p0.u + t * (p1.u - p0.u)
    }
  }

  return points[points.length - 1]!.u
}
