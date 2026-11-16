/**
 * File-backed persistence for a class-sized deployment (tens of students):
 *
 *   students.json                         accounts
 *   workspaces/<studentId>/<tutorial>.json  a student's settings and runs
 *
 * Everything is small JSON written atomically; no database to operate.
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { atomicWrite } from '../../core/project/files.js'
import type { Value } from './expr.js'

export interface Student {
  id: string
  name: string
  /** Normalised name used for sign-in lookups. */
  nameKey: string
  pinHash: string
  createdAt: string
  lastSeenAt: string
  /** Run submissions on `runDay` (UTC date), for the daily allowance. */
  runDay?: string
  runCount?: number
}

export interface RunRef {
  id: string
  /** Run 1 is the reference solution, so student runs start at 2. */
  number: number
  hash: string
  createdAt: string
  /** Parameters that differ from the tutorial defaults. */
  changed: Record<string, Value>
  /** Case files the student edited by hand for this run. */
  overridden: string[]
}

export interface Workspace {
  tutorialId: string
  values: Record<string, Value>
  overrides: Record<string, string>
  runs: RunRef[]
  nextRunNumber: number
  updatedAt: string
  openedAt: string
}

const STUDENT_ID = /^[a-z0-9]{12}$/

export function normaliseName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

function hashPin(pin: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(pin.normalize('NFKC'), salt, 32, { N: 16384, r: 8, p: 1 }, (error, key) => error ? reject(error) : resolve(key))
  })
}

export async function createPinHash(pin: string): Promise<string> {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('base64url')}$${(await hashPin(pin, salt)).toString('base64url')}`
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64url')
  const actual = await hashPin(pin, Buffer.from(salt, 'base64url'))
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export class ClassStore {
  private students: Student[] = []
  private workspaces = new Map<string, Workspace>()
  private readonly studentsFile: string
  private readonly workspaceRoot: string

  constructor(private readonly dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true })
    this.studentsFile = path.join(dataDir, 'students.json')
    this.workspaceRoot = path.join(dataDir, 'workspaces')
    fs.mkdirSync(this.workspaceRoot, { recursive: true })
    if (fs.existsSync(this.studentsFile)) {
      this.students = JSON.parse(fs.readFileSync(this.studentsFile, 'utf8')) as Student[]
    }
  }

  private saveStudents(): void {
    atomicWrite(this.studentsFile, JSON.stringify(this.students, null, 2))
  }

  listStudents(): Student[] { return this.students }
  student(id: string): Student | undefined { return this.students.find(student => student.id === id) }
  studentByName(name: string): Student | undefined {
    const key = normaliseName(name)
    return this.students.find(student => student.nameKey === key)
  }

  async createStudent(name: string, pin: string): Promise<Student> {
    const now = new Date().toISOString()
    const student: Student = {
      id: randomUUID().replace(/-/g, '').slice(0, 12), name: name.normalize('NFKC').trim().replace(/\s+/g, ' '),
      nameKey: normaliseName(name), pinHash: await createPinHash(pin), createdAt: now, lastSeenAt: now,
    }
    // Re-check after the async hash: two sign-ups for one name must not both win.
    if (this.studentByName(name)) throw new Error('That name is already taken')
    this.students.push(student)
    this.saveStudents()
    return student
  }

  async resetPin(studentId: string, pin: string): Promise<void> {
    const student = this.student(studentId)
    if (!student) throw new Error('Unknown student')
    student.pinHash = await createPinHash(pin)
    this.saveStudents()
  }

  removeStudent(studentId: string): void {
    if (!STUDENT_ID.test(studentId)) return
    this.students = this.students.filter(student => student.id !== studentId)
    this.saveStudents()
    for (const key of [...this.workspaces.keys()]) if (key.startsWith(`${studentId}/`)) this.workspaces.delete(key)
    fs.rmSync(path.join(this.workspaceRoot, studentId), { recursive: true, force: true })
  }

  touchStudent(student: Student): void {
    const now = Date.now()
    // At most one write a minute per student.
    if (now - Date.parse(student.lastSeenAt) < 60_000) return
    student.lastSeenAt = new Date(now).toISOString()
    this.saveStudents()
  }

  /** Count a run submission against today's allowance; false when it is used up. */
  countRun(student: Student, limit: number): boolean {
    const today = new Date().toISOString().slice(0, 10)
    if (student.runDay !== today) { student.runDay = today; student.runCount = 0 }
    if ((student.runCount ?? 0) >= limit) return false
    student.runCount = (student.runCount ?? 0) + 1
    this.saveStudents()
    return true
  }

  private workspaceFile(studentId: string, tutorialId: string): string {
    if (!STUDENT_ID.test(studentId) || !/^[a-z][a-z0-9-]{1,40}$/.test(tutorialId)) throw new Error('Invalid workspace id')
    return path.join(this.workspaceRoot, studentId, `${tutorialId}.json`)
  }

  /** The stored workspace, or null if the student never opened this tutorial. */
  peekWorkspace(studentId: string, tutorialId: string): Workspace | null {
    const key = `${studentId}/${tutorialId}`
    const cached = this.workspaces.get(key)
    if (cached) return cached
    const file = this.workspaceFile(studentId, tutorialId)
    if (!fs.existsSync(file)) return null
    const workspace = JSON.parse(fs.readFileSync(file, 'utf8')) as Workspace
    this.workspaces.set(key, workspace)
    return workspace
  }

  workspace(studentId: string, tutorialId: string): Workspace {
    const existing = this.peekWorkspace(studentId, tutorialId)
    if (existing) return existing
    const now = new Date().toISOString()
    const workspace: Workspace = { tutorialId, values: {}, overrides: {}, runs: [], nextRunNumber: 2, updatedAt: now, openedAt: now }
    this.workspaces.set(`${studentId}/${tutorialId}`, workspace)
    return workspace
  }

  saveWorkspace(studentId: string, workspace: Workspace): void {
    workspace.updatedAt = new Date().toISOString()
    this.workspaces.set(`${studentId}/${workspace.tutorialId}`, workspace)
    atomicWrite(this.workspaceFile(studentId, workspace.tutorialId), JSON.stringify(workspace, null, 2))
  }

  /** Every result hash a student run points at (protected from cache eviction). */
  referencedHashes(): Set<string> {
    const hashes = new Set<string>()
    for (const entry of fs.readdirSync(this.workspaceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || !STUDENT_ID.test(entry.name)) continue
      for (const file of fs.readdirSync(path.join(this.workspaceRoot, entry.name))) {
        if (!file.endsWith('.json')) continue
        const workspace = this.peekWorkspace(entry.name, file.slice(0, -5))
        for (const run of workspace?.runs ?? []) hashes.add(run.hash)
      }
    }
    return hashes
  }

  workspacesOf(studentId: string): Workspace[] {
    const dir = path.join(this.workspaceRoot, studentId)
    if (!STUDENT_ID.test(studentId) || !fs.existsSync(dir)) return []
    return fs.readdirSync(dir).filter(file => file.endsWith('.json'))
      .map(file => this.peekWorkspace(studentId, file.slice(0, -5))).filter((w): w is Workspace => w !== null)
  }
}
