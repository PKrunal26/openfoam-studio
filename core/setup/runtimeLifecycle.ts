import fs from 'fs'
import path from 'path'
import { atomicWrite } from '../project/files.js'

/** Reconcile metadata only; an interrupted job never resumes automatically or touches case files. */
export function reconcileInterruptedProjects(projectsDirectory: string): { projects: number; runs: number } {
  const changed = { projects: 0, runs: 0 }
  if (!fs.existsSync(projectsDirectory)) return changed
  for (const entry of fs.readdirSync(projectsDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const metaFile = path.join(projectsDirectory, entry.name, 'meta.json')
    if (fs.existsSync(metaFile) && fs.lstatSync(metaFile).isFile()) {
      try {
        const metadata: unknown = JSON.parse(fs.readFileSync(metaFile, 'utf8'))
        if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('Invalid metadata object')
        const record = metadata as Record<string, unknown>
        if (record['status'] === 'running' || record['status'] === 'generating') {
          atomicWrite(metaFile, JSON.stringify({ ...record, status: 'interrupted', interruptedAt: new Date().toISOString() }, null, 2))
          changed.projects++
        }
      } catch {
        console.warn(`Could not reconcile metadata for project ${entry.name}; original data preserved for recovery.`)
      }
    }
    const runsFile = path.join(projectsDirectory, entry.name, 'runs.jsonl')
    if (!fs.existsSync(runsFile) || !fs.lstatSync(runsFile).isFile()) continue
    let updated = false
    const lines = fs.readFileSync(runsFile, 'utf8').split('\n').map(line => {
      if (!line.trim()) return line
      try {
        const run = JSON.parse(line) as Record<string, unknown>
        if (run['status'] !== 'running') return line
        updated = true
        changed.runs++
        return JSON.stringify({ ...run, status: 'aborted', finishedAt: new Date().toISOString(), errorMessage: 'Application stopped before this run completed; inspect logs before restarting.' })
      } catch { return line }
    })
    if (updated) atomicWrite(runsFile, lines.join('\n'))
  }
  return changed
}
