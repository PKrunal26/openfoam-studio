/**
 * ResidualParser — extract initial residuals from OpenFOAM solver logs.
 *
 * Pure function, no filesystem access. Handles both smoothSolver and GAMG prefixes.
 * icoFoam / foamRun emit one "Initial residual" line per field per time step.
 */

// Matches lines like:
//   smoothSolver:  Solving for Ux, Initial residual = 0.0823, ...
//   GAMG:  Solving for p, Initial residual = 0.0512, ...
const RESIDUAL_RE = /Solving for (\w+), Initial residual = ([\d.eE+-]+)/g

/**
 * Parse a solver log string and return a map of field → ordered residual values.
 * Returns an empty object if no solver lines are found.
 */
export function parseResiduals(log: string): Record<string, number[]> {
  const result: Record<string, number[]> = {}
  let match: RegExpExecArray | null

  RESIDUAL_RE.lastIndex = 0
  while ((match = RESIDUAL_RE.exec(log)) !== null) {
    const field = match[1]!
    const value = parseFloat(match[2]!)
    if (!result[field]) result[field] = []
    result[field]!.push(value)
  }

  return result
}
