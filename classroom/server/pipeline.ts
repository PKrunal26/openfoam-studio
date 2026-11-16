/**
 * Runs one rendered case through OpenFOAM in Docker and collects a compact,
 * immutable result directory:
 *
 *   result.json        status, timings, mesh size, written times
 *   log.txt            full output of every stage
 *   convergence.json   residual / Courant history (see logParse.ts)
 *   inputs/**          the exact case files that were solved
 *   VTK/**             foamToVTK output for the Results viewer
 *
 * Every command goes through core/docker/CommandRunner (allowlist, no network,
 * read-only rootfs, memory/CPU/pid limits). Raw OpenFOAM time directories are
 * discarded after export so a result costs megabytes, not hundreds of them.
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import type Docker from 'dockerode'
import { runDockerCommand, meshCheckPassed, OPENFOAM_IMAGE } from '../../core/docker/CommandRunner.js'
import { hasFatalSolverLog } from '../../core/run/logSafety.js'
import { atomicWrite } from '../../core/project/files.js'
import { extractFatalMessage, parseCellCount, parseConvergence, parseDatTable, parseTimeLine, thinIndices, type MonitorData } from './logParse.js'
import type { RenderedCase, Tutorial } from './tutorials.js'

export type StageName = 'mesh' | 'initialise' | 'solve' | 'export'

export interface StageRecord { name: string; exitCode: number; ms: number }

export interface RunResult {
  hash: string
  tutorialId: string
  status: 'succeeded' | 'failed'
  /** Student-facing explanation when status is "failed". */
  reason?: string
  failedStage?: string
  createdAt: string
  durationMs: number
  image: string
  stages: StageRecord[]
  cells: number | null
  finalTime: number | null
  /** Solver stopped early because its residual targets were met (steady cases). */
  converged: boolean
  vtkBytes: number
}

export interface PipelineHooks {
  onLine?: (line: string) => void
  onStage?: (stage: StageName) => void
  onProgress?: (fraction: number) => void
}

/** Thrown for outcomes that say nothing about the case itself (never cached). */
export class PipelineInterrupted extends Error {
  constructor(public readonly kind: 'cancelled' | 'error', message: string) { super(message) }
}

const CASE_MOUNT = '/cavity'
const MAX_WORK_BYTES = 600 * 1024 * 1024
const MAX_EXPORT_STEPS = 60
const MAX_LOG_BYTES = 8 * 1024 * 1024

function dirSize(dir: string): number {
  let total = 0
  const walk = (current: string) => {
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(current, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) { try { total += fs.statSync(full).size } catch { /* raced with the solver */ } }
    }
  }
  walk(dir)
  return total
}

function openPermissions(dir: string): void {
  // The solver container may run under a different uid than this process.
  fs.chmodSync(dir, 0o777)
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) openPermissions(full)
    else fs.chmodSync(full, 0o666)
  }
}

function writtenTimes(caseDir: string): { name: string; value: number }[] {
  return fs.readdirSync(caseDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^\d+(?:\.\d+)?(?:e[-+]?\d+)?$/i.test(entry.name))
    .map(entry => ({ name: entry.name, value: Number(entry.name) }))
    .filter(time => Number.isFinite(time.value))
    .sort((a, b) => a.value - b.value)
}

/** At most `max` entries, evenly spread, always keeping the first and last. */
export function thinTimes<T>(times: T[], max: number): T[] {
  if (times.length <= max) return times
  const picked = new Set<number>()
  for (let i = 0; i < max; i++) picked.add(Math.round((i * (times.length - 1)) / (max - 1)))
  return [...picked].sort((a, b) => a - b).map(index => times[index]!)
}

/** Collect the tutorial's monitor plots from postProcessing/<functionObject>/<time>/*.dat. */
function readMonitors(caseDir: string, tutorial: Tutorial): MonitorData[] {
  const tables = new Map<string, Record<string, number[]>>()
  const table = (name: string): Record<string, number[]> => {
    const cached = tables.get(name)
    if (cached) return cached
    let parsed: Record<string, number[]> = {}
    try {
      const root = path.join(caseDir, 'postProcessing', name)
      for (const timeDir of fs.readdirSync(root).sort()) {
        const file = fs.readdirSync(path.join(root, timeDir)).find(entry => entry.endsWith('.dat'))
        if (!file) continue
        const full = path.join(root, timeDir, file)
        if (fs.statSync(full).size <= 32 * 1024 * 1024) parsed = parseDatTable(fs.readFileSync(full, 'utf8'))
        break
      }
    } catch { /* the function object wrote nothing */ }
    tables.set(name, parsed)
    return parsed
  }
  const monitors: MonitorData[] = []
  for (const def of tutorial.def.monitors ?? []) {
    const first = table(def.series[0]!.file)
    const times = first['Time'] ?? []
    if (!times.length) continue
    const keep = thinIndices(times.length, 1200)
    monitors.push({
      title: def.title, yLabel: def.yLabel ?? '', times: keep.map(i => times[i]!),
      series: def.series.map(series => {
        const column = table(series.file)[series.column]
        return { label: series.label, values: keep.map(i => { const value = column?.[i]; return value !== undefined && Number.isFinite(value) ? value : null }) }
      }),
    })
  }
  return monitors
}

function containerUser(): string | undefined {
  const uid = process.getuid?.()
  const gid = process.getgid?.()
  return uid !== undefined && gid !== undefined && uid !== 0 ? `${uid}:${gid}` : undefined
}

export async function runPipeline(options: {
  docker: Docker
  tutorial: Tutorial
  rendered: RenderedCase
  workDir: string
  resultDir: string
  signal: AbortSignal
  jobId: string
  hooks?: PipelineHooks
}): Promise<RunResult> {
  const { docker, tutorial, rendered, workDir, resultDir, hooks } = options
  const started = Date.now()
  const caseDir = path.join(workDir, 'case')
  fs.rmSync(workDir, { recursive: true, force: true })
  for (const [relPath, content] of rendered.files) {
    const target = path.join(caseDir, ...relPath.split('/'))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
  }
  openPermissions(caseDir)

  const limit = AbortSignal.timeout(tutorial.def.run.maxWallSeconds * 1000)
  const oversize = new AbortController()
  const signal = AbortSignal.any([options.signal, limit, oversize.signal])
  const sizeGuard = setInterval(() => {
    if (dirSize(workDir) > MAX_WORK_BYTES) oversize.abort()
  }, 3000)
  sizeGuard.unref()

  const logParts: string[] = []
  let logBytes = 0
  // Only the solver's own output feeds the convergence history: blockMesh and
  // foamToVTK print "Time =" lines too.
  const solverLines: string[] = []
  const stages: StageRecord[] = []
  const emit = (line: string) => {
    if (logBytes < MAX_LOG_BYTES) { logParts.push(line); logBytes += line.length + 1 }
    hooks?.onLine?.(line)
  }
  const user = containerUser()

  /** Returns the exit code and that stage's own output. */
  const stage = async (name: string, command: string, args: string[], onLine?: (line: string) => void) => {
    const t0 = Date.now()
    const own: string[] = []
    emit(`\n──── ${name} ────  $ ${command} ${args.filter(a => a !== '-case' && a !== CASE_MOUNT).join(' ')}`.trimEnd())
    const exitCode = await runDockerCommand(docker, {
      command, args: ['-case', CASE_MOUNT, ...args.filter(a => a !== '-case' && a !== CASE_MOUNT)], caseDir, signal,
      timeoutMs: tutorial.def.run.maxWallSeconds * 1000 + 30_000, jobId: options.jobId, ...(user ? { user } : {}),
      onLine: line => { own.push(line); emit(line); onLine?.(line) },
    })
    stages.push({ name, exitCode, ms: Date.now() - t0 })
    return { exitCode, text: own.join('\n') }
  }

  const base: Omit<RunResult, 'status'> = {
    hash: rendered.hash, tutorialId: tutorial.def.id, createdAt: new Date().toISOString(), durationMs: 0,
    image: OPENFOAM_IMAGE, stages, cells: null, finalTime: null, converged: false, vtkBytes: 0,
  }
  const finish = (result: RunResult): RunResult => {
    result.durationMs = Date.now() - started
    const log = logParts.join('\n') + '\n'
    fs.rmSync(resultDir, { recursive: true, force: true })
    fs.mkdirSync(resultDir, { recursive: true })
    for (const [relPath, content] of rendered.files) {
      const target = path.join(resultDir, 'inputs', ...relPath.split('/'))
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, content)
    }
    fs.writeFileSync(path.join(resultDir, 'log.txt'), log)
    fs.writeFileSync(path.join(resultDir, 'convergence.json'), JSON.stringify(parseConvergence(solverLines.join('\n'))))
    fs.writeFileSync(path.join(resultDir, 'monitors.json'), JSON.stringify(readMonitors(caseDir, tutorial)))
    const vtk = path.join(caseDir, 'VTK')
    if (result.status === 'succeeded' && fs.existsSync(vtk)) {
      // ASCII VTK compresses about 5x; results are stored and served gzipped.
      const copy = (from: string, to: string) => {
        fs.mkdirSync(to, { recursive: true })
        for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
          if (entry.isDirectory()) copy(path.join(from, entry.name), path.join(to, entry.name))
          else if (entry.isFile()) fs.writeFileSync(path.join(to, `${entry.name}.gz`), zlib.gzipSync(fs.readFileSync(path.join(from, entry.name)), { level: 6 }))
        }
      }
      copy(vtk, path.join(resultDir, 'VTK'))
      result.vtkBytes = dirSize(path.join(resultDir, 'VTK'))
    }
    // result.json is written last: its presence marks the directory complete.
    atomicWrite(path.join(resultDir, 'result.json'), JSON.stringify(result, null, 2))
    return result
  }
  const failed = (failedStage: string, reason: string): RunResult =>
    finish({ ...base, status: 'failed', failedStage, reason })

  try {
    hooks?.onStage?.('mesh')
    const mesh = await stage('Mesh generation', 'blockMesh', [])
    if (mesh.exitCode !== 0) {
      return failed('mesh', extractFatalMessage(mesh.text) ?? 'blockMesh could not build the mesh from system/blockMeshDict.')
    }
    const check = await stage('Mesh check', 'checkMesh', [])
    base.cells = parseCellCount(check.text)
    if (!meshCheckPassed(check.exitCode, check.text)) {
      return failed('mesh', extractFatalMessage(check.text) ?? 'checkMesh reported mesh quality failures. See the log for the failed checks.')
    }

    if (rendered.files.has('system/setFieldsDict')) {
      hooks?.onStage?.('initialise')
      const init = await stage('Field initialisation', 'setFields', [])
      if (init.exitCode !== 0) {
        return failed('initialise', extractFatalMessage(init.text) ?? 'setFields could not initialise the fields.')
      }
    }

    hooks?.onStage?.('solve')
    const solve = await stage('Solver', 'foamRun', [], line => {
      solverLines.push(line)
      const time = parseTimeLine(line)
      if (time === null) return
      base.finalTime = time
      if (rendered.endTime > 0) hooks?.onProgress?.(Math.min(1, Math.max(0, time / rendered.endTime)))
    })
    const ended = /^\s*End\s*$/m.test(solve.text)
    if (solve.exitCode !== 0 || hasFatalSolverLog(solve.text) || !ended || base.finalTime === null) {
      return failed('solve', extractFatalMessage(solve.text)
        ?? (solve.exitCode !== 0 ? `The solver stopped with exit code ${solve.exitCode}.` : 'The solver did not finish cleanly.'))
    }
    base.converged = /solution converged in/i.test(solve.text)

    hooks?.onStage?.('export')
    const skipInitial = tutorial.def.run.steady || tutorial.def.run.skipInitial === true
    const times = writtenTimes(caseDir).filter(time => !skipInitial || time.value > 0)
    const selected = thinTimes(times, MAX_EXPORT_STEPS)
    const timeArgs = selected.length < times.length ? ['-time', selected.map(time => time.name).join(',')] : []
    const exported = await stage('Result export', 'foamToVTK', [
      '-ascii', '-useTimeName', ...(skipInitial ? ['-noZero'] : []),
      '-fields', `(${tutorial.def.run.fields.join(' ')})`, ...timeArgs,
    ])
    if (exported.exitCode !== 0 || !fs.existsSync(path.join(caseDir, 'VTK'))) {
      return failed('export', extractFatalMessage(exported.text) ?? 'foamToVTK could not export the results.')
    }
    return finish({ ...base, status: 'succeeded' })
  } catch (error) {
    if (limit.aborted) {
      const minutes = Math.round(tutorial.def.run.maxWallSeconds / 60)
      emit(`\nStopped: the run exceeded this tutorial's ${minutes} minute compute limit.`)
      return failed('solve', `The run exceeded this tutorial's ${minutes} minute compute limit. Use a coarser mesh, a larger time step or a shorter end time.`)
    }
    if (oversize.signal.aborted) {
      emit('\nStopped: the run wrote more output than the classroom allows.')
      return failed('solve', 'The run wrote too much data. Increase the write interval so fewer time steps are saved.')
    }
    if (options.signal.aborted) throw new PipelineInterrupted('cancelled', 'Run cancelled')
    throw new PipelineInterrupted('error', (error as Error).message || 'Docker execution failed')
  } finally {
    clearInterval(sizeGuard)
    fs.rmSync(workDir, { recursive: true, force: true })
  }
}
