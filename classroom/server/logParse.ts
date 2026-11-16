/**
 * Solver-log parsing for the classroom: live progress and convergence history.
 * Pure functions, no filesystem access.
 */

const TIME_RE = /^\s*Time\s*=\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*s?\s*$/
const RESIDUAL_RE = /Solving for ([\w.]+), Initial residual = ([-+\d.eE]+)/
const COURANT_RE = /^\s*Courant Number mean:\s*([-+\d.eE]+)\s*max:\s*([-+\d.eE]+)/

/** The solver time on a `Time = 0.5s` line, or null for any other line. */
export function parseTimeLine(line: string): number | null {
  const match = TIME_RE.exec(line)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

export interface Convergence {
  /** solver time (transient) or iteration number (steady) of each sample */
  times: number[]
  /** field → initial residual of its first solve in each sampled step */
  residuals: Record<string, (number | null)[]>
  /** maximum Courant number per sampled step, when the solver reports it */
  courantMax: (number | null)[]
  /** total steps in the log before down-sampling */
  steps: number
}

/**
 * One sample per time step: the *first* initial residual of each field in that
 * step (later PISO/PIMPLE correctors re-solve the same field and would make the
 * curve saw-toothed). Long runs are thinned to `maxPoints` samples.
 */
export function parseConvergence(log: string, maxPoints = 600): Convergence {
  const times: number[] = []
  const rows: Record<string, number>[] = []
  const courant: (number | null)[] = []
  let current: Record<string, number> | null = null
  let pendingCourant: number | null = null
  for (const line of log.split('\n')) {
    const time = parseTimeLine(line)
    if (time !== null) {
      current = {}
      times.push(time)
      rows.push(current)
      courant.push(pendingCourant)
      pendingCourant = null
      continue
    }
    const co = COURANT_RE.exec(line)
    if (co) { const value = Number(co[2]); pendingCourant = Number.isFinite(value) ? value : null; continue }
    if (!current) continue
    const residual = RESIDUAL_RE.exec(line)
    if (residual) {
      const field = residual[1]!
      const value = Number(residual[2])
      if (!(field in current) && Number.isFinite(value)) current[field] = value
    }
  }
  const steps = times.length
  const stride = Math.max(1, Math.ceil(steps / maxPoints))
  const fields = new Set<string>()
  for (const row of rows) for (const field of Object.keys(row)) fields.add(field)
  // Algebraic "solves" (e.g. rho with the diagonal solver) always report 0 and carry no information.
  for (const field of [...fields]) if (rows.every(row => !row[field])) fields.delete(field)
  const out: Convergence = { times: [], residuals: {}, courantMax: [], steps }
  for (const field of fields) out.residuals[field] = []
  for (let i = 0; i < steps; i += stride) {
    // Keep the last step so the curve ends where the run ended.
    const index = i + stride >= steps ? steps - 1 : i
    out.times.push(times[index]!)
    out.courantMax.push(courant[index] ?? null)
    for (const field of fields) out.residuals[field]!.push(rows[index]![field] ?? null)
    if (index === steps - 1) break
  }
  return out
}

/** Cell count from a checkMesh log (`cells:  400`). */
export function parseCellCount(log: string): number | null {
  const match = /^\s*cells:\s+(\d+)\s*$/m.exec(log)
  return match ? Number(match[1]) : null
}

/** The most useful single line to show a student when OpenFOAM stops with an error. */
export function extractFatalMessage(log: string): string | null {
  const lines = log.split('\n')
  const start = lines.findIndex(line => /FOAM FATAL (?:IO )?ERROR/.test(line))
  if (start < 0) {
    if (/floating point exception|SIGFPE/i.test(log)) {
      return 'The solver crashed with a floating point exception: the solution diverged. Try a smaller time step or a coarser mesh.'
    }
    return null
  }
  const body: string[] = []
  for (let i = start + 1; i < lines.length && body.length < 4; i++) {
    const line = lines[i]!.trim()
    if (!line) { if (body.length) break; continue }
    if (/^From |^in file |^file: /i.test(line)) break
    body.push(line)
  }
  return body.join(' ').slice(0, 400) || 'OpenFOAM reported a fatal error.'
}

export interface MonitorData {
  title: string
  yLabel: string
  times: number[]
  series: { label: string; values: (number | null)[] }[]
}

/**
 * Parse an OpenFOAM function-object table (`# Time  Cd  Cl ...` then rows).
 * Returns column name → values, with the first column under "Time".
 */
export function parseDatTable(text: string): Record<string, number[]> {
  let header: string[] = []
  const rows: number[][] = []
  for (const line of text.split('\n')) {
    if (line.startsWith('#')) {
      const names = line.slice(1).trim().split(/\s{2,}|\t+/).map(name => name.trim()).filter(Boolean)
      if (names.length > 1) header = names
      continue
    }
    const cells = line.trim().split(/\s+/)
    if (cells.length < 2) continue
    const numbers = cells.map(cell => Number(cell.replace(/[()]/g, '')))
    if (numbers.every(Number.isFinite)) rows.push(numbers)
  }
  const table: Record<string, number[]> = {}
  header.forEach((name, index) => { table[index === 0 ? 'Time' : name] = rows.map(row => row[index] ?? NaN) })
  return table
}

/** Thin a series to at most `maxPoints` samples, keeping the first and last. */
export function thinIndices(count: number, maxPoints: number): number[] {
  if (count <= maxPoints) return Array.from({ length: count }, (_, i) => i)
  const picked = new Set<number>()
  for (let i = 0; i < maxPoints; i++) picked.add(Math.round((i * (count - 1)) / (maxPoints - 1)))
  return [...picked].sort((a, b) => a - b)
}
