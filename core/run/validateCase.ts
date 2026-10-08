import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type Docker from 'dockerode'
import { meshCheckPassed, runDockerCommand } from '../docker/CommandRunner.js'
import { assertCaseExecutionPolicy } from './casePolicy.js'
import { hasFatalSolverLog } from './logSafety.js'
import { validateWrittenFields, type FieldValidation } from '../postprocess/fieldValidation.js'

export interface CaseReadiness { ok: boolean; solver: string; missing: string[]; errors: string[] }

/** Solver-aware prerequisite gate shared by tools, generation, and full runs. */
export function inspectCaseReadiness(caseDir: string): CaseReadiness {
  const read = (relative: string) => {
    try { return fs.readFileSync(path.join(caseDir, relative), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '') } catch { return '' }
  }
  const control = read(path.join('system', 'controlDict'))
  const solver = /(?:^|\n)\s*solver\s+([\w]+)\s*;/.exec(control)?.[1] ?? ''
  const required = ['0/U', 'system/blockMeshDict', 'system/controlDict', 'system/fvSchemes', 'system/fvSolution']
  const errors: string[] = []
  if (solver === 'incompressibleFluid') required.push('0/p', 'constant/physicalProperties', 'constant/momentumTransport')
  else if (solver === 'incompressibleVoF') {
    required.push('0/p_rgh', 'constant/phaseProperties', 'constant/g')
    const phaseText = read(path.join('constant', 'phaseProperties'))
    const phases = /\bphases\s*\(([^)]+)\)/.exec(phaseText)?.[1]?.trim().split(/\s+/) ?? []
    if (phases.length !== 2 || phases.some(phase => !/^[\w]+$/.test(phase))) errors.push('VoF requires two explicitly named phases')
    else {
      required.push(`0/alpha.${phases[0]}`)
      for (const phase of phases) required.push(`constant/physicalProperties.${phase}`)
    }
  } else errors.push(`Solver ${solver || '(missing)'} is outside the supported deterministic validation profiles`)
  for (const name of ['deltaT', 'startTime', 'endTime']) {
    const match = new RegExp(`(?:^|\\n)\\s*${name}\\s+([\\d.eE+-]+)\\s*;`).exec(control)
    const value = Number(match?.[1])
    if (!match || !Number.isFinite(value) || (name === 'deltaT' && value <= 0)) errors.push(`Invalid ${name} in controlDict`)
  }
  const start = Number(/\bstartTime\s+([\d.eE+-]+)\s*;/.exec(control)?.[1])
  const end = Number(/\bendTime\s+([\d.eE+-]+)\s*;/.exec(control)?.[1])
  if (Number.isFinite(start) && Number.isFinite(end) && end <= start) errors.push('endTime must be greater than startTime')
  const missing = required.filter(relative => {
    try { return !fs.statSync(path.join(caseDir, relative)).isFile() } catch { return true }
  })
  return { ok: missing.length === 0 && errors.length === 0, solver, missing, errors }
}

export interface CaseValidationResult {
  ok: boolean
  meshChecked: boolean
  solverAdvanced: boolean
  log: string
  failedCommand?: string
  fields?: FieldValidation
}

/** Never overwrite real time directories or the visible controlDict during smoke validation. */
export async function validateCaseInIsolation(docker: Docker, caseDir: string, options: {
  signal?: AbortSignal; steps?: number; onLine?: (line: string) => void; timeoutMs?: number
  onCommand?: (command: string, phase: 'start' | 'end', ok?: boolean) => void
} = {}): Promise<CaseValidationResult> {
  const readiness = inspectCaseReadiness(caseDir)
  if (!readiness.ok) throw new Error([...readiness.missing.map(file => `Missing ${file}`), ...readiness.errors].join('; '))
  assertCaseExecutionPolicy(caseDir)
  const signal = AbortSignal.any([options.signal ?? new AbortController().signal, AbortSignal.timeout(options.timeoutMs ?? 5 * 60_000)])
  signal.throwIfAborted()
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ofs-validate-'))
  const isolated = path.join(temporary, 'case')
  fs.mkdirSync(isolated)
  try {
    for (const directory of ['0', 'constant', 'system']) fs.cpSync(path.join(caseDir, directory), path.join(isolated, directory), { recursive: true })
    const controlPath = path.join(isolated, 'system', 'controlDict')
    let control = fs.readFileSync(controlPath, 'utf8')
    const deltaT = Number(/\bdeltaT\s+([\d.eE+-]+)\s*;/.exec(control)?.[1])
    const start = Number(/\bstartTime\s+([\d.eE+-]+)\s*;/.exec(control)?.[1])
    const steps = Math.min(50, Math.max(1, options.steps ?? 5))
    control = control.replace(/\bendTime\s+[^;]+;/, `endTime ${start + deltaT * steps};`)
      .replace(/\bstartFrom\s+[^;]+;/, 'startFrom startTime;')
    // Always retain an ASCII field at each smoke step so exit 0 alone can never
    // establish numerical sanity. These edits exist only in the isolated copy.
    for (const [key, value] of Object.entries({ writeControl: 'timeStep', writeInterval: '1', writeFormat: 'ascii', purgeWrite: '0' })) {
      const entry = new RegExp(`\\b${key}\\s+[^;]+;`)
      control = entry.test(control) ? control.replace(entry, `${key} ${value};`) : `${control}\n${key} ${value};\n`
    }
    fs.writeFileSync(controlPath, control.replace(/\r\n?/g, '\n'))
    const commands = ['blockMesh', 'checkMesh', ...(fs.existsSync(path.join(isolated, 'system', 'setFieldsDict')) ? ['setFields'] : []), 'foamRun']
    let meshChecked = false
    let log = ''
    for (const command of commands) {
      signal.throwIfAborted()
      options.onCommand?.(command, 'start')
      let commandLog = ''
      const exitCode = await runDockerCommand(docker, { command, args: [], caseDir: isolated, signal,
        onLine: line => { commandLog = (commandLog + '\n' + line).slice(-2 * 1024 * 1024); options.onLine?.(line) } })
      log = (log + '\n' + commandLog).slice(-4 * 1024 * 1024)
      signal.throwIfAborted()
      const advanced = [...commandLog.matchAll(/(?:^|\n)Time\s*=\s*([\d.eE+-]+)/g)].some(match => Number(match[1]) > start) && /Solving for\s+\w+/.test(commandLog)
      const ok = command === 'checkMesh' ? meshCheckPassed(exitCode, commandLog) :
        exitCode === 0 && !hasFatalSolverLog(commandLog) && (command !== 'foamRun' || advanced)
      const fields = command === 'foamRun' && ok ? validateWrittenFields(isolated, { startTime: start }) : undefined
      const verified = ok && (!fields || fields.ok)
      options.onCommand?.(command, 'end', verified)
      if (!verified) return { ok: false, meshChecked, solverAdvanced: command === 'foamRun' && advanced, log: fields && !fields.ok ? `${log}\n${fields.issues.join('\n')}` : log, failedCommand: command, ...(fields ? { fields } : {}) }
      if (command === 'checkMesh') meshChecked = true
      if (fields) return { ok: true, meshChecked, solverAdvanced: true, log, fields }
    }
    return { ok: true, meshChecked, solverAdvanced: true, log }
  } finally { fs.rmSync(temporary, { recursive: true, force: true }) }
}
