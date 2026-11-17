/**
 * Content-addressed result store: results/<hash>/ holds one solved case.
 *
 * The hash covers the rendered case files, so two students who pick the same
 * settings share one result and the second one costs no compute. The reference
 * solution of each tutorial is simply the entry for its default parameters.
 */
import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { buildVtkSeries, type VtkSeries } from '../../core/postprocess/vtkSeries.js'
import { projectFiles } from '../../core/project/files.js'
import { computeFieldRanges, type FieldRangeTable } from './fieldRanges.js'
import type { Convergence, MonitorData } from './logParse.js'
import type { RunResult } from './pipeline.js'

const HASH = /^[0-9a-f]{40}$/
/** Whole-run field ranges, cached beside the result once computed. */
const RANGES_FILE = 'field-ranges.json'

export interface VtkManifest { files: { relPath: string; size: number }[]; series: VtkSeries }

export class ResultStore {
  readonly root: string
  private cache = new Map<string, RunResult>()
  private manifests = new Map<string, VtkManifest>()
  private fieldRangeTables = new Map<string, FieldRangeTable>()
  private fieldRangeJobs = new Map<string, Promise<FieldRangeTable>>()

  constructor(dataDir: string) {
    this.root = path.join(dataDir, 'results')
    fs.mkdirSync(this.root, { recursive: true })
    // Half-written directories from a crash have no result.json; drop them.
    for (const entry of fs.readdirSync(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (!HASH.test(entry.name) || !fs.existsSync(path.join(this.root, entry.name, 'result.json'))) {
        fs.rmSync(path.join(this.root, entry.name), { recursive: true, force: true })
      }
    }
  }

  dir(hash: string): string {
    if (!HASH.test(hash)) throw new Error('Invalid result id')
    return path.join(this.root, hash)
  }

  /** Staging directory for a job; renamed into place by commit(). */
  stagingDir(jobId: string): string {
    return path.join(this.root, `.staging-${jobId.replace(/[^\w-]/g, '')}`)
  }

  commit(stagingDir: string, result: RunResult): void {
    const target = this.dir(result.hash)
    fs.rmSync(target, { recursive: true, force: true })
    fs.renameSync(stagingDir, target)
    this.cache.set(result.hash, result)
    this.manifests.delete(result.hash)
    this.fieldRangeTables.delete(result.hash)
    // Ready before the student opens the Results tab.
    if (result.status === 'succeeded') this.warmFieldRanges(result.hash)
  }

  read(hash: string): RunResult | null {
    const cached = this.cache.get(hash)
    if (cached) return cached
    if (!HASH.test(hash)) return null
    try {
      const result = JSON.parse(fs.readFileSync(path.join(this.root, hash, 'result.json'), 'utf8')) as RunResult
      this.cache.set(hash, result)
      return result
    } catch { return null }
  }

  /** Mark as recently used so eviction keeps what students are looking at. */
  touch(hash: string): void {
    const now = new Date()
    try { fs.utimesSync(path.join(this.dir(hash), 'result.json'), now, now) } catch { /* evicted meanwhile */ }
  }

  remove(hash: string): void {
    fs.rmSync(this.dir(hash), { recursive: true, force: true })
    this.cache.delete(hash)
    this.manifests.delete(hash)
    this.fieldRangeTables.delete(hash)
  }

  logPath(hash: string): string { return path.join(this.dir(hash), 'log.txt') }

  convergence(hash: string): Convergence | null {
    try { return JSON.parse(fs.readFileSync(path.join(this.dir(hash), 'convergence.json'), 'utf8')) as Convergence } catch { return null }
  }

  monitors(hash: string): MonitorData[] {
    try { return JSON.parse(fs.readFileSync(path.join(this.dir(hash), 'monitors.json'), 'utf8')) as MonitorData[] } catch { return [] }
  }

  inputs(hash: string): { relPath: string; content: string }[] {
    const dir = path.join(this.dir(hash), 'inputs')
    return projectFiles(dir).map(file => ({ relPath: file.relPath, content: fs.readFileSync(file.path, 'utf8') }))
  }

  manifest(hash: string): VtkManifest {
    const cached = this.manifests.get(hash)
    if (cached) return cached
    const dir = path.join(this.dir(hash), 'VTK')
    // Files are stored gzipped; the manifest lists them under their plain names.
    const files = projectFiles(dir).filter(file => file.relPath.endsWith('.gz'))
      .map(file => ({ relPath: file.relPath.slice(0, -3), size: fs.statSync(file.path).size }))
    const manifest = { files, series: buildVtkSeries(files.map(file => file.relPath)) }
    this.manifests.set(hash, manifest)
    return manifest
  }

  /**
   * Whole-run range of every field component, so the browser can colour all
   * time steps on one scale without downloading the whole run. Computed once
   * per result, then kept beside it — every student who opens the same result
   * gets it from the manifest.
   */
  async fieldRanges(hash: string): Promise<FieldRangeTable> {
    const ready = this.cachedFieldRanges(hash)
    if (ready) return ready

    const running = this.fieldRangeJobs.get(hash)
    if (running) return running
    const job = (async (): Promise<FieldRangeTable> => {
      const table = await computeFieldRanges(this.manifest(hash).series, (relPath) => {
        const absolute = this.vtkFile(hash, relPath)
        if (!absolute) throw new Error(`Not part of this result: ${relPath}`)
        return gunzipSync(fs.readFileSync(absolute)).toString('utf8')
      })
      const file = path.join(this.dir(hash), RANGES_FILE)
      try { fs.writeFileSync(file, JSON.stringify(table)) } catch { /* read-only or evicted meanwhile */ }
      this.fieldRangeTables.set(hash, table)
      return table
    })()
    this.fieldRangeJobs.set(hash, job)
    void job.catch(() => undefined).finally(() => this.fieldRangeJobs.delete(hash))
    return job
  }

  /** The table if it is already in memory or on disk; never computes. */
  cachedFieldRanges(hash: string): FieldRangeTable | null {
    const cached = this.fieldRangeTables.get(hash)
    if (cached) return cached
    try {
      const stored = JSON.parse(fs.readFileSync(path.join(this.dir(hash), RANGES_FILE), 'utf8')) as FieldRangeTable
      this.fieldRangeTables.set(hash, stored)
      return stored
    } catch { return null }
  }

  /** Compute the table in the background so the first student does not wait. */
  warmFieldRanges(hash: string): void {
    void this.fieldRanges(hash).catch(() => undefined)
  }

  /** Absolute path of a (gzipped) VTK file, or null when it is not part of the result. */
  vtkFile(hash: string, relPath: string): string | null {
    if (!this.manifest(hash).files.some(file => file.relPath === relPath)) return null
    return path.join(this.dir(hash), 'VTK', ...`${relPath}.gz`.split('/'))
  }

  list(): { hash: string; bytes: number; usedAt: number; result: RunResult }[] {
    const entries: { hash: string; bytes: number; usedAt: number; result: RunResult }[] = []
    for (const entry of fs.readdirSync(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !HASH.test(entry.name)) continue
      const result = this.read(entry.name)
      if (!result) continue
      let usedAt = 0
      try { usedAt = fs.statSync(path.join(this.root, entry.name, 'result.json')).mtimeMs } catch { /* ignore */ }
      const bytes = projectFiles(path.join(this.root, entry.name)).reduce((sum, file) => sum + fs.statSync(file.path).size, 0)
      entries.push({ hash: entry.name, bytes, usedAt, result })
    }
    return entries
  }

  /** Delete least-recently-used results nobody references until under budget. */
  evict(isProtected: (hash: string) => boolean, maxBytes: number): { removed: number; bytes: number } {
    const entries = this.list()
    let total = entries.reduce((sum, entry) => sum + entry.bytes, 0)
    let removed = 0
    for (const entry of entries.sort((a, b) => a.usedAt - b.usedAt)) {
      if (total <= maxBytes) break
      if (isProtected(entry.hash)) continue
      this.remove(entry.hash)
      total -= entry.bytes
      removed++
    }
    return { removed, bytes: total }
  }
}
