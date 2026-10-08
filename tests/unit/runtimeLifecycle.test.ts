import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reconcileInterruptedProjects } from '../../core/setup/runtimeLifecycle.js'

let directory: string
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ofs-lifecycle-')) })
afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }) })

describe('startup reconciliation', () => {
  it('preserves malformed metadata while continuing to reconcile other projects and that project’s runs', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const broken = path.join(directory, 'broken')
      const healthy = path.join(directory, 'healthy')
      fs.mkdirSync(broken); fs.mkdirSync(healthy)
      fs.writeFileSync(path.join(broken, 'meta.json'), '{truncated')
      fs.writeFileSync(path.join(broken, 'runs.jsonl'), '{"id":"unfinished","status":"running"}\n')
      fs.writeFileSync(path.join(healthy, 'meta.json'), '{"status":"generating"}')
      expect(reconcileInterruptedProjects(directory)).toEqual({ projects: 1, runs: 1 })
      expect(fs.readFileSync(path.join(broken, 'meta.json'), 'utf8')).toBe('{truncated')
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('original data preserved'))
      expect(JSON.parse(fs.readFileSync(path.join(healthy, 'meta.json'), 'utf8')).status).toBe('interrupted')
    } finally { warn.mockRestore() }
  })
  it('marks unfinished jobs interrupted and running records aborted while preserving cases and finished runs', () => {
    const project = path.join(directory, 'project')
    fs.mkdirSync(path.join(project, 'case', 'system'), { recursive: true })
    const caseFile = path.join(project, 'case', 'system', 'controlDict')
    fs.writeFileSync(caseFile, 'untouched case input')
    fs.writeFileSync(path.join(project, 'meta.json'), JSON.stringify({ id: 'project', status: 'generating', messages: [{ content: 'preserved chat' }] }))
    fs.writeFileSync(path.join(project, 'runs.jsonl'), '{"id":"old","status":"success"}\n{"id":"unfinished","status":"running","inputRevision":"abc"}\ncorrupt existing line\n')
    expect(reconcileInterruptedProjects(directory)).toEqual({ projects: 1, runs: 1 })
    expect(JSON.parse(fs.readFileSync(path.join(project, 'meta.json'), 'utf8'))).toMatchObject({ status: 'interrupted', messages: [{ content: 'preserved chat' }] })
    const lines = fs.readFileSync(path.join(project, 'runs.jsonl'), 'utf8').split('\n')
    expect(JSON.parse(lines[0]!)).toEqual({ id: 'old', status: 'success' })
    expect(JSON.parse(lines[1]!)).toMatchObject({ id: 'unfinished', status: 'aborted', inputRevision: 'abc' })
    expect(lines[2]).toBe('corrupt existing line')
    expect(fs.readFileSync(caseFile, 'utf8')).toBe('untouched case input')
    expect(reconcileInterruptedProjects(directory)).toEqual({ projects: 0, runs: 0 })
  })
})
