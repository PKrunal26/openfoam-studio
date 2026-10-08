import { hasFatalSolverLog } from './logSafety.js'

export interface ContinuityObservation {
  time: number | null
  local: number
  global: number
  /** Intermediate pressure correctors may omit cumulative continuity. */
  cumulative: number | null
}

export interface RunEvidence {
  ok: boolean
  advanced: boolean
  completed: boolean
  startTime: number | null
  endTime: number | null
  finalTime: number | null
  continuity: {
    /** Actual log observations; an empty list means continuity was not measured. */
    observations: ContinuityObservation[]
    maxAbsGlobal: number | null
    finite: boolean
  }
  issues: string[]
}

/** Log evidence is separate from exit status, field checks and physics validation. */
export function evaluateRunEvidence(log: string, controlDict: string): RunEvidence {
  const issues: string[] = []
  const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/
  const finiteNumber = (value: string): number | null => numeric.test(value) && Number.isFinite(Number(value)) ? Number(value) : null
  const control = controlDict.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  const setting = (name: string): number | null => {
    const matches = [...control.matchAll(new RegExp(`(?:^|(?<=[;\\n}]))\\s*${name}\\s+([^;\\s]+)\\s*;`, 'g'))]
    const value = Number(matches[0]?.[1])
    if (matches.length !== 1 || !Number.isFinite(value)) {
      issues.push(`A unique finite ${name} is required to verify the requested time range`)
      return null
    }
    return value
  }
  const startTime = setting('startTime')
  const endTime = setting('endTime')
  if (startTime !== null && endTime !== null && endTime <= startTime) issues.push('Requested endTime must be greater than startTime')
  let finalTime: number | null = null
  let advanced = false
  const observations: ContinuityObservation[] = []
  let continuityFinite = true
  for (const line of log.split(/\r?\n/)) {
    const time = /^\s*Time\s*=\s*(.*?)\s*$/.exec(line)
    if (time) {
      // Foundation 13 prints dimensioned times such as `Time = 10s`.
      // Only the optional seconds suffix is supported; arbitrary suffixes fail.
      const token = time[1]!.replace(/\s*s$/, '')
      const value = finiteNumber(token)
      if (value === null) issues.push('Solver reported a malformed or non-finite output time')
      else {
        finalTime = value
        if (startTime !== null && value > startTime) advanced = true
      }
    }
    if (/continuity errors\s*:/i.test(line)) {
      const values = /continuity errors\s*:\s*sum local\s*=\s*([^,\s]+)\s*,\s*global\s*=\s*([^,\s]+)(?:\s*,\s*cumulative\s*=\s*([^,\s]+))?\s*$/i.exec(line)
      if (!values) {
        continuityFinite = false
        issues.push('Solver continuity observation could not be parsed')
      } else {
        const local = finiteNumber(values[1]!); const global = finiteNumber(values[2]!)
        const cumulative = values[3] === undefined ? null : finiteNumber(values[3])
        if (local === null || global === null || (values[3] !== undefined && cumulative === null)) {
          continuityFinite = false
          issues.push('Solver reported malformed or non-finite continuity values')
        } else observations.push({ time: finalTime, local, global, cumulative })
      }
    }
  }
  if (!advanced) issues.push('No solver time advanced beyond the requested startTime')
  const ended = /^\s*End\s*$/m.test(log)
  if (!ended) issues.push('Solver did not report its End completion marker')
  // Relative roundoff tolerance accommodates decimal time-step arithmetic;
  // it cannot excuse a missing step or an early successful process exit.
  const tolerance = endTime === null ? 0 : Math.max(1, Math.abs(endTime)) * 1e-9
  const reachedEnd = finalTime !== null && endTime !== null && finalTime >= endTime - tolerance
  if (!reachedEnd) issues.push(`Final solver time ${finalTime ?? '(missing)'} did not reach requested endTime ${endTime ?? '(unknown)'}`)
  if (hasFatalSolverLog(log)) {
    issues.push('Solver log contains a fatal error or non-finite numerical value')
  }
  const completed = ended && reachedEnd && advanced && issues.length === 0
  return {
    ok: completed,
    advanced,
    completed,
    startTime,
    endTime,
    finalTime,
    continuity: {
      observations,
      maxAbsGlobal: observations.length ? observations.reduce((maximum, value) => Math.max(maximum, Math.abs(value.global)), 0) : null,
      finite: continuityFinite,
    },
    issues,
  }
}
