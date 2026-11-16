/**
 * Content-addressed result store: results/<hash>/ holds one solved case.
 *
 * The hash covers the rendered case files, so two students who pick the same
 * settings share one result and the second one costs no compute. The reference
 * solution of each tutorial is simply the entry for its default parameters.
 */
import fs from 'node:fs'
import path from 'node:path'
import { buildVtkSeries, type VtkSeries } from '../../core/postprocess/vtkSeries.js'
import { projectFiles } from '../../core/project/files.js'
import type { Convergence, MonitorData } from './logParse.js'
import type { RunResult } from './pipeline.js'

const HASH = /^[0-9a-f]{40}$/

export interface VtkManifest { files: { relPath: string; size: number }[]; series: VtkSeries }

export class ResultStore {
  readonly root: string
  private cache = new Map<string, RunResult>()
  private manifests = new Map<string, VtkManifest>()

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
