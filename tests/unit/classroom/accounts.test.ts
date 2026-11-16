import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AttemptLimiter, codesMatch, Sessions } from '../../../classroom/server/auth.js'
import { ClassStore, createPinHash, normaliseName, verifyPin } from '../../../classroom/server/store.js'
import { ResultStore } from '../../../classroom/server/results.js'
import type { RunResult } from '../../../classroom/server/pipeline.js'

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ofs-classroom-test-')) })
afterEach(() => { vi.useRealTimers(); fs.rmSync(dir, { recursive: true, force: true }) })

describe('classroom sessions', () => {
  const sessions = new Sessions(Buffer.from('0123456789abcdef0123456789abcdef'), false)

  it('round-trips a subject and rejects tampering', () => {
    const token = sessions.issue('student123456')
    expect(sessions.verify(token)).toBe('student123456')
    expect(sessions.verify(`${token}x`)).toBeNull()
    const [payload, signature] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ s: 'instructor', e: Date.now() + 1e9 })).toString('base64url')
    expect(sessions.verify(`${forged}.${signature}`)).toBeNull()
    expect(sessions.verify(payload)).toBeNull()
    expect(sessions.verify(undefined)).toBeNull()
    expect(new Sessions(Buffer.from('another-secret-another-secret-00'), false).verify(token)).toBeNull()
  })

  it('expires tokens', () => {
    vi.useFakeTimers()
    const token = sessions.issue('a', 1)
    vi.advanceTimersByTime(23 * 3600_000)
    expect(sessions.verify(token)).toBe('a')
    vi.advanceTimersByTime(2 * 3600_000)
    expect(sessions.verify(token)).toBeNull()
  })

  it('limits repeated attempts inside the window', () => {
    vi.useFakeTimers()
    const limiter = new AttemptLimiter(3, 60_000)
    expect([1, 2, 3, 4].map(() => limiter.allow('k'))).toEqual([true, true, true, false])
    expect(limiter.allow('other')).toBe(true)
    vi.advanceTimersByTime(61_000)
    expect(limiter.allow('k')).toBe(true)
    limiter.reset('k')
    expect(limiter.allow('k')).toBe(true)
  })

  it('compares shared codes exactly, ignoring surrounding spaces', () => {
    expect(codesMatch(' cfd2026 ', 'cfd2026')).toBe(true)
    expect(codesMatch('cfd2025', 'cfd2026')).toBe(false)
    expect(codesMatch('', 'cfd2026')).toBe(false)
  })
})

describe('classroom store', () => {
  it('hashes PINs and verifies them', async () => {
    const hash = await createPinHash('1234')
    expect(hash).not.toContain('1234')
    expect(await verifyPin('1234', hash)).toBe(true)
    expect(await verifyPin('1235', hash)).toBe(false)
    expect(await verifyPin('1234', 'garbage')).toBe(false)
  })

  it('keeps one account per normalised name and persists it', async () => {
    const store = new ClassStore(dir)
    const ada = await store.createStudent('  Ada   Lovelace ', '1234')
    expect(ada.name).toBe('Ada Lovelace')
    expect(normaliseName('ADA  lovelace')).toBe(ada.nameKey)
    await expect(store.createStudent('ada lovelace', '9999')).rejects.toThrow(/taken/)
    const reloaded = new ClassStore(dir)
    expect(reloaded.studentByName('Ada Lovelace')?.id).toBe(ada.id)
    expect(JSON.stringify(reloaded.listStudents())).not.toContain('1234')
  })

  it('stores workspaces per student and tutorial', async () => {
    const store = new ClassStore(dir)
    const student = await store.createStudent('Grace Hopper', 'abcd')
    expect(store.peekWorkspace(student.id, 'cavity')).toBeNull()
    const workspace = store.workspace(student.id, 'cavity')
    workspace.values = { nu: 0.001 }
    workspace.runs.push({ id: 'r1', number: 2, hash: 'a'.repeat(40), createdAt: new Date().toISOString(), changed: { nu: 0.001 }, overridden: [] })
    store.saveWorkspace(student.id, workspace)
    const reloaded = new ClassStore(dir)
    expect(reloaded.workspace(student.id, 'cavity').values).toEqual({ nu: 0.001 })
    expect([...reloaded.referencedHashes()]).toEqual(['a'.repeat(40)])
    expect(() => store.workspace('../../etc', 'cavity')).toThrow()
    expect(() => store.workspace(student.id, '../x')).toThrow()
    reloaded.removeStudent(student.id)
    expect(reloaded.referencedHashes().size).toBe(0)
    expect(new ClassStore(dir).listStudents()).toEqual([])
  })

  it('enforces the daily run allowance', async () => {
    const store = new ClassStore(dir)
    const student = await store.createStudent('Katherine Johnson', 'abcd')
    expect([1, 2, 3].map(() => store.countRun(student, 2))).toEqual([true, true, false])
    student.runDay = '2000-01-01'
    expect(store.countRun(student, 2)).toBe(true)
  })
})

describe('classroom result store', () => {
  const result = (hash: string): RunResult => ({
    hash, tutorialId: 'cavity', status: 'succeeded', createdAt: new Date().toISOString(), durationMs: 1000,
    image: 'test', stages: [], cells: 400, finalTime: 0.5, converged: false, vtkBytes: 0,
  })
  const stage = (store: ResultStore, hash: string, bytes: number) => {
    const staging = store.stagingDir(hash.slice(0, 8))
    fs.mkdirSync(path.join(staging, 'VTK', 'wall'), { recursive: true })
    fs.writeFileSync(path.join(staging, 'VTK', 'cavity_0.5.vtk.gz'), Buffer.alloc(bytes))
    fs.writeFileSync(path.join(staging, 'VTK', 'wall', 'wall_0.5.vtk.gz'), Buffer.alloc(10))
    fs.writeFileSync(path.join(staging, 'result.json'), JSON.stringify(result(hash)))
    store.commit(staging, result(hash))
  }

  it('commits, lists files under their plain names and guards paths', () => {
    const store = new ResultStore(dir)
    const hash = 'b'.repeat(40)
    stage(store, hash, 100)
    expect(store.read(hash)?.cells).toBe(400)
    const manifest = store.manifest(hash)
    expect(manifest.files.map(file => file.relPath).sort()).toEqual(['cavity_0.5.vtk', 'wall/wall_0.5.vtk'])
    expect(manifest.series.times).toEqual([0.5])
    expect(store.vtkFile(hash, 'cavity_0.5.vtk')).toMatch(/cavity_0\.5\.vtk\.gz$/)
    expect(store.vtkFile(hash, '../result.json')).toBeNull()
    expect(store.read('../../etc')).toBeNull()
    expect(() => store.dir('nope')).toThrow()
  })

  it('drops half-written results on startup', () => {
    fs.mkdirSync(path.join(dir, 'results', 'c'.repeat(40)), { recursive: true })
    fs.mkdirSync(path.join(dir, 'results', '.staging-x'), { recursive: true })
    const store = new ResultStore(dir)
    expect(fs.readdirSync(store.root)).toEqual([])
  })

  it('evicts the least recently used unprotected results over budget', () => {
    const store = new ResultStore(dir)
    const [old, kept, fresh] = ['1'.repeat(40), '2'.repeat(40), '3'.repeat(40)]
    for (const hash of [old, kept, fresh]) stage(store, hash, 1000)
    const past = new Date(Date.now() - 3600_000)
    fs.utimesSync(path.join(store.dir(old), 'result.json'), past, past)
    fs.utimesSync(path.join(store.dir(kept), 'result.json'), past, past)
    const { removed } = store.evict(hash => hash === kept, 2500)
    expect(removed).toBe(1)
    expect(store.read(old)).toBeNull()
    expect(store.read(kept)).not.toBeNull()
    expect(store.read(fresh)).not.toBeNull()
  })
})
