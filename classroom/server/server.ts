/**
 * OpenFOAM Studio Classroom: multi-user web server.
 *
 * Serves the SimScale-style workbench (classroom/web/dist) and a JSON API:
 * students sign in, open pre-solved tutorials, change parameters and queue
 * re-runs. See docs/CLASSROOM.md for deployment.
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import zlib from 'node:zlib'
import { randomUUID } from 'node:crypto'
import { pipeline } from 'node:stream'
import Docker from 'dockerode'
import { cleanupOwnedContainers, ensureOpenFoamImage, OPENFOAM_IMAGE } from '../../core/docker/CommandRunner.js'
import { HttpError, parseObject, readRequestBody } from '../../core/http/requests.js'
import { AttemptLimiter, codesMatch, INSTRUCTOR_COOKIE, loadSecret, readCookie, Sessions, STUDENT_COOKIE } from './auth.js'
import { loadConfig } from './config.js'
import { parseConvergence } from './logParse.js'
import { BAKE, RunQueue, type JobView } from './queue.js'
import { ResultStore } from './results.js'
import { ClassStore, verifyPin, type RunRef, type Student, type Workspace } from './store.js'
import {
  changedParams, loadCatalog, renderCase, resolveParams, validateOverride,
  type RenderedCase, type ResolvedParams, type Tutorial,
} from './tutorials.js'

const config = loadConfig()
const catalog = loadCatalog(config.tutorialsDir)
const store = new ClassStore(config.dataDir)
const results = new ResultStore(config.dataDir)
const sessions = new Sessions(loadSecret(config.dataDir), config.secureCookies)
const docker = new Docker(process.platform === 'win32' ? { socketPath: '//./pipe/docker_engine' } : {})
const signInLimiter = new AttemptLimiter(8, 10 * 60_000)
const clientLimiter = new AttemptLimiter(300, 10 * 60_000)
const MAX_STUDENTS = Number(process.env['OFS_MAX_STUDENTS']) || 300
const TRUST_PROXY = process.env['OFS_TRUST_PROXY'] === '1'

const referenceCases = new Map<string, RenderedCase>()
for (const tutorial of catalog.values()) {
  referenceCases.set(tutorial.def.id, renderCase(tutorial, resolveParams(tutorial)))
}
const referenceHashes = new Set([...referenceCases.values()].map(rendered => rendered.hash))

function evictIfNeeded(): void {
  try {
    const referenced = store.referencedHashes()
    results.evict(hash => referenceHashes.has(hash) || referenced.has(hash), config.cacheMaxBytes)
  } catch (error) {
    console.error('[cache] eviction failed:', (error as Error).message)
  }
}

const queue = new RunQueue(docker, results, path.join(config.dataDir, 'work'), config.maxConcurrentRuns, evictIfNeeded)

// ── Views ────────────────────────────────────────────────────────────────────

type RunStatus = 'succeeded' | 'failed' | 'queued' | 'running' | 'cancelled' | 'error' | 'interrupted' | 'missing'

interface RunView {
  id: string
  number: number
  label: string
  isReference: boolean
  createdAt: string | null
  hash: string
  status: RunStatus
  reason: string | null
  job: JobView | null
  result: { cells: number | null; finalTime: number | null; durationMs: number; converged: boolean; failedStage: string | null } | null
  changed: Record<string, number | string>
  overridden: string[]
}

function describeHash(hash: string, isReference: boolean): Pick<RunView, 'status' | 'reason' | 'job' | 'result'> {
  const result = results.read(hash)
  if (result) {
    return {
      status: result.status, reason: result.reason ?? null, job: null,
      result: { cells: result.cells, finalTime: result.finalTime, durationMs: result.durationMs, converged: result.converged, failedStage: result.failedStage ?? null },
    }
  }
  const job = queue.job(hash)
  if (job) return { status: job.state, reason: null, job, result: null }
  const outcome = queue.outcome(hash)
  if (outcome) return { status: outcome.kind, reason: outcome.message, job: null, result: null }
  return isReference
    ? { status: 'missing', reason: queue.computeOnline ? 'The reference solution has not been computed yet.' : 'The compute backend is offline, so the reference solution has not been computed.', job: null, result: null }
    : { status: 'interrupted', reason: 'The server restarted before this run finished. Run it again to get results.', job: null, result: null }
}

function referenceView(tutorial: Tutorial): RunView {
  const hash = referenceCases.get(tutorial.def.id)!.hash
  return {
    id: 'reference', number: 1, label: 'Reference solution', isReference: true, createdAt: results.read(hash)?.createdAt ?? null,
    hash, ...describeHash(hash, true), changed: {}, overridden: [],
  }
}

function runView(run: RunRef): RunView {
  return {
    id: run.id, number: run.number, label: `Run ${run.number}`, isReference: false, createdAt: run.createdAt,
    hash: run.hash, ...describeHash(run.hash, false), changed: run.changed, overridden: run.overridden,
  }
}

function resolveWorkspace(tutorial: Tutorial, workspace: Workspace): { resolved: ResolvedParams; rendered: RenderedCase | null; renderError: string | null } {
  const resolved = resolveParams(tutorial, workspace.values)
  try {
    return { resolved, rendered: renderCase(tutorial, resolved, workspace.overrides), renderError: null }
  } catch (error) {
    return { resolved, rendered: null, renderError: (error as Error).message }
  }
}

function workspaceView(student: Student, tutorial: Tutorial, workspace: Workspace) {
  const { resolved, rendered, renderError } = resolveWorkspace(tutorial, workspace)
  const issues = [...resolved.issues]
  if (renderError) issues.push({ level: 'error', message: renderError })
  const reference = referenceView(tutorial)
  const runs = [reference, ...workspace.runs.map(runView)]
  const matching = rendered ? runs.find(run => run.hash === rendered.hash) : undefined
  return {
    values: resolved.values,
    derived: resolved.derived,
    issues,
    changed: Object.keys(changedParams(tutorial, resolved.values)),
    overrides: Object.keys(workspace.overrides),
    runs,
    /** The run that already holds results for exactly these settings, if any. */
    matchesRun: matching?.id ?? null,
    limits: {
      maxRuns: config.maxRunsPerTutorial,
      runsUsed: workspace.runs.length,
      runsToday: student.runDay === new Date().toISOString().slice(0, 10) ? student.runCount ?? 0 : 0,
      maxRunsPerDay: config.maxRunsPerDay,
    },
  }
}

function tutorialSummary(tutorial: Tutorial, student: Student) {
  const { def } = tutorial
  const workspace = store.peekWorkspace(student.id, def.id)
  const reference = referenceView(tutorial)
  return {
    id: def.id, order: def.order, title: def.title, subtitle: def.subtitle, summary: def.summary, difficulty: def.difficulty,
    analysisType: def.analysisType, solver: def.solver, dimension: def.dimension, tags: def.tags,
    estimatedRuntime: def.estimatedRuntime, hasThumbnail: thumbnailPath(def.id) !== null,
    reference: { status: reference.status, cells: reference.result?.cells ?? null, progress: reference.job?.progress ?? null },
    mine: workspace ? { runs: workspace.runs.length, openedAt: workspace.openedAt, updatedAt: workspace.updatedAt } : null,
  }
}

function thumbnailPath(tutorialId: string): string | null {
  for (const ext of ['webp', 'png', 'jpg', 'svg']) {
    const file = path.join(config.tutorialsDir, tutorialId, `thumbnail.${ext}`)
    if (fs.existsSync(file)) return file
  }
  return null
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8', '.vtk': 'text/plain; charset=utf-8',
}
const COMPRESSIBLE = /^(?:text\/|application\/json|image\/svg)/

// Framing is refused by default (clickjacking). OFS_ALLOW_FRAMING=1 lifts that for
// embedding the site in an LMS page or a development preview pane.
const ALLOW_FRAMING = process.env['OFS_ALLOW_FRAMING'] === '1'
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  ...(ALLOW_FRAMING ? {} : { 'X-Frame-Options': 'DENY' }),
  'Content-Security-Policy': [
    "default-src 'self'", "img-src 'self' data: blob:", "style-src 'self' 'unsafe-inline'", "font-src 'self' data:",
    "worker-src 'self' blob:", "connect-src 'self'", ...(ALLOW_FRAMING ? [] : ["frame-ancestors 'none'"]), "base-uri 'self'", "form-action 'self'",
  ].join('; '),
}

function acceptsGzip(req: http.IncomingMessage): boolean {
  return /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))
}

function sendBuffer(req: http.IncomingMessage, res: http.ServerResponse, status: number, body: Buffer, type: string, headers: Record<string, string> = {}): void {
  const base = { 'Content-Type': type, Vary: 'Accept-Encoding', ...headers }
  if (body.length > 1024 && COMPRESSIBLE.test(type) && acceptsGzip(req)) {
    zlib.gzip(body, { level: 5 }, (error, compressed) => {
      if (error) { res.writeHead(status, base); res.end(body); return }
      res.writeHead(status, { ...base, 'Content-Encoding': 'gzip', 'Content-Length': compressed.length })
      res.end(compressed)
    })
    return
  }
  res.writeHead(status, { ...base, 'Content-Length': body.length })
  res.end(body)
}

function sendJSON(req: http.IncomingMessage, res: http.ServerResponse, status: number, value: unknown): void {
  sendBuffer(req, res, status, Buffer.from(JSON.stringify(value)), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' })
}

function sendFile(req: http.IncomingMessage, res: http.ServerResponse, file: string, cacheControl: string, type?: string): void {
  const contentType = type ?? MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
  const stat = fs.statSync(file)
  const headers: Record<string, string | number> = { 'Content-Type': contentType, 'Cache-Control': cacheControl, Vary: 'Accept-Encoding' }
  const source = fs.createReadStream(file)
  const onError = () => { if (!res.headersSent) res.writeHead(500); res.end() }
  if (stat.size > 1024 && COMPRESSIBLE.test(contentType) && acceptsGzip(req)) {
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip' })
    pipeline(source, zlib.createGzip({ level: 5 }), res, error => { if (error) onError() })
  } else {
    res.writeHead(200, { ...headers, 'Content-Length': stat.size })
    pipeline(source, res, error => { if (error) onError() })
  }
}

/** Result VTK files are stored gzipped and are immutable for a given hash. */
function sendVtk(req: http.IncomingMessage, res: http.ServerResponse, gzFile: string): void {
  const headers = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, max-age=604800, immutable', Vary: 'Accept-Encoding' }
  const onError = (error: Error | null) => { if (error && !res.headersSent) { res.writeHead(500); res.end() } }
  if (acceptsGzip(req)) {
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': fs.statSync(gzFile).size })
    pipeline(fs.createReadStream(gzFile), res, onError)
  } else {
    res.writeHead(200, headers)
    pipeline(fs.createReadStream(gzFile), zlib.createGunzip(), res, onError)
  }
}

function clientAddress(req: http.IncomingMessage): string {
  if (TRUST_PROXY) {
    const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim()
    if (forwarded) return forwarded
  }
  return req.socket.remoteAddress ?? 'unknown'
}

/** Browsers send Origin on cross-site writes; refuse any that is not this site. */
function assertSameOrigin(req: http.IncomingMessage): void {
  const origin = req.headers.origin
  if (!origin) return
  let host: string
  try { host = new URL(origin).host } catch { throw new HttpError(403, 'Invalid origin') }
  if (host !== req.headers.host) throw new HttpError(403, 'Cross-site requests are not allowed')
}

async function body(req: http.IncomingMessage, limit = 512 * 1024): Promise<Record<string, unknown>> {
  return parseObject(await readRequestBody(req, limit))
}

function text(object: Record<string, unknown>, key: string, min: number, max: number, label: string): string {
  const value = object[key]
  if (typeof value !== 'string') throw new HttpError(400, `${label} is required`)
  const trimmed = value.trim()
  if (trimmed.length < min || trimmed.length > max) throw new HttpError(400, `${label} must be ${min}–${max} characters`)
  return trimmed
}

function currentStudent(req: http.IncomingMessage): Student | null {
  const id = sessions.verify(readCookie(req, STUDENT_COOKIE))
  return id ? store.student(id) ?? null : null
}

function isInstructor(req: http.IncomingMessage): boolean {
  return !!config.instructorCode && sessions.verify(readCookie(req, INSTRUCTOR_COOKIE)) === 'instructor'
}

function studentView(student: Student) {
  return { id: student.id, name: student.name }
}

// ── Log access ───────────────────────────────────────────────────────────────

const logCache = new Map<string, string[]>()
function storedLogLines(hash: string): string[] {
  const cached = logCache.get(hash)
  if (cached) return cached
  const lines = fs.readFileSync(results.logPath(hash), 'utf8').split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  logCache.set(hash, lines)
  if (logCache.size > 12) logCache.delete(logCache.keys().next().value!)
  return lines
}

// ── Routes ───────────────────────────────────────────────────────────────────

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const method = req.method ?? 'GET'
  const parts = url.pathname.split('/').filter(Boolean).slice(1).map(decodeURIComponent)
  if (method !== 'GET' && method !== 'HEAD') assertSameOrigin(req)
  const route = `${method} /${parts.join('/')}`

  // ── Session ──
  if (route === 'GET /session') {
    const student = currentStudent(req)
    if (student) store.touchStudent(student)
    sendJSON(req, res, 200, {
      className: config.className, student: student ? studentView(student) : null,
      requiresClassCode: !!config.classCode, instructor: isInstructor(req), instructorEnabled: !!config.instructorCode,
    })
    return
  }
  if (route === 'POST /session/join') {
    const input = await body(req)
    const mode = input['mode'] === 'new' ? 'new' : 'returning'
    const name = text(input, 'name', 2, 60, 'Name')
    const pin = text(input, 'pin', 4, 64, 'PIN')
    const address = clientAddress(req)
    if (!clientLimiter.allow(address) || !signInLimiter.allow(`${address}|${name.toLowerCase()}`)) {
      throw new HttpError(429, 'Too many attempts. Wait a few minutes and try again.')
    }
    let student: Student | undefined
    if (mode === 'new') {
      if (config.classCode && !codesMatch(typeof input['code'] === 'string' ? input['code'] : '', config.classCode)) {
        throw new HttpError(403, 'That class code is not correct. Ask your instructor for the code.')
      }
      if (store.studentByName(name)) throw new HttpError(409, 'That name is already registered. Choose “I already have an account”, or add an initial to your name.')
      if (store.listStudents().length >= MAX_STUDENTS) throw new HttpError(403, 'This class is full. Ask your instructor.')
      try { student = await store.createStudent(name, pin) } catch (error) { throw new HttpError(409, (error as Error).message) }
    } else {
      const found = store.studentByName(name)
      // Hash even when the name is unknown so timing does not reveal accounts.
      const ok = found ? await verifyPin(pin, found.pinHash) : (await verifyPin(pin, 'scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), false)
      if (!found || !ok) throw new HttpError(401, 'Name or PIN is incorrect.')
      student = found
    }
    signInLimiter.reset(`${address}|${name.toLowerCase()}`)
    sessions.setCookie(res, STUDENT_COOKIE, sessions.issue(student.id))
    sendJSON(req, res, 200, { student: studentView(student) })
    return
  }
  if (route === 'POST /session/logout') {
    sessions.clearCookie(res, STUDENT_COOKIE)
    sessions.clearCookie(res, INSTRUCTOR_COOKIE)
    sendJSON(req, res, 200, { ok: true })
    return
  }

  // ── Instructor ──
  if (route === 'POST /admin/login') {
    if (!config.instructorCode) throw new HttpError(404, 'Instructor access is not configured on this server.')
    if (!signInLimiter.allow(`${clientAddress(req)}|instructor`)) throw new HttpError(429, 'Too many attempts. Wait a few minutes and try again.')
    const input = await body(req)
    if (!codesMatch(typeof input['code'] === 'string' ? input['code'] : '', config.instructorCode)) throw new HttpError(403, 'That instructor code is not correct.')
    sessions.setCookie(res, INSTRUCTOR_COOKIE, sessions.issue('instructor', 14), 14)
    sendJSON(req, res, 200, { ok: true })
    return
  }
  if (parts[0] === 'admin') {
    if (!isInstructor(req)) throw new HttpError(401, 'Instructor sign-in required')
    await handleAdmin(req, res, method, parts.slice(1))
    return
  }

  if (parts[0] === 'tutorials' && parts.length === 3 && parts[2] === 'thumbnail' && method === 'GET') {
    const file = /^[a-z][a-z0-9-]{1,40}$/.test(parts[1]!) ? thumbnailPath(parts[1]!) : null
    if (!file) throw new HttpError(404, 'No thumbnail')
    sendFile(req, res, file, 'public, max-age=3600')
    return
  }

  // Everything below needs a signed-in student.
  const student = currentStudent(req)
  if (!student) throw new HttpError(401, 'Please sign in')

  if (route === 'GET /status') {
    const summary = queue.summary()
    sendJSON(req, res, 200, {
      compute: { online: summary.online, running: summary.running, queued: summary.queued, slots: summary.slots },
      mine: queue.activeFor(student.id),
    })
    return
  }
  if (route === 'GET /tutorials') {
    sendJSON(req, res, 200, { tutorials: [...catalog.values()].map(tutorial => tutorialSummary(tutorial, student)) })
    return
  }

  if (parts[0] !== 'tutorials' || !parts[1]) throw new HttpError(404, 'Route not found')
  const tutorial = catalog.get(parts[1])
  if (!tutorial) throw new HttpError(404, 'Tutorial not found')
  const sub = parts.slice(2)
  const subRoute = `${method} /${sub.join('/')}`

  if (subRoute === 'GET /') {
    const workspace = store.workspace(student.id, tutorial.def.id)
    if (!store.peekWorkspace(student.id, tutorial.def.id) || Date.now() - Date.parse(workspace.openedAt) > 60_000) {
      workspace.openedAt = new Date().toISOString()
      store.saveWorkspace(student.id, workspace)
    }
    sendJSON(req, res, 200, { tutorial: tutorial.def, guide: tutorial.guide, workspace: workspaceView(student, tutorial, workspace) })
    return
  }
  if (subRoute === 'GET /workspace') {
    sendJSON(req, res, 200, workspaceView(student, tutorial, store.workspace(student.id, tutorial.def.id)))
    return
  }
  if (subRoute === 'PUT /workspace') {
    const input = await body(req)
    const values = input['values']
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new HttpError(400, 'values must be an object')
    const workspace = store.workspace(student.id, tutorial.def.id)
    const merged = { ...workspace.values }
    for (const def of tutorial.def.params) {
      const raw = (values as Record<string, unknown>)[def.id]
      if (raw === undefined) continue
      // Keep only values that pass their own range check; the form shows the rejection.
      const check = resolveParams(tutorial, { [def.id]: raw })
      const error = check.issues.find(issue => issue.param === def.id)
      if (error) throw new HttpError(422, error.message)
      merged[def.id] = check.values[def.id]!
    }
    workspace.values = changedParams(tutorial, merged)
    store.saveWorkspace(student.id, workspace)
    sendJSON(req, res, 200, workspaceView(student, tutorial, workspace))
    return
  }
  if (subRoute === 'POST /workspace/reset') {
    const workspace = store.workspace(student.id, tutorial.def.id)
    workspace.values = {}
    workspace.overrides = {}
    store.saveWorkspace(student.id, workspace)
    sendJSON(req, res, 200, workspaceView(student, tutorial, workspace))
    return
  }

  // ── Case files of the current settings ──
  if (subRoute === 'GET /files') {
    const workspace = store.workspace(student.id, tutorial.def.id)
    const resolved = resolveParams(tutorial, workspace.values)
    const generated = renderCase(tutorial, resolved)
    const files = [...generated.files].map(([relPath, content]) => {
      const override = workspace.overrides[relPath]
      return { relPath, content: override ?? content, generated: content, overridden: override !== undefined }
    })
    sendJSON(req, res, 200, { files })
    return
  }
  if (subRoute === 'PUT /files') {
    const input = await body(req)
    const relPath = text(input, 'path', 1, 200, 'path')
    if (typeof input['content'] !== 'string') throw new HttpError(400, 'content is required')
    let content: string
    try { content = validateOverride(tutorial, relPath, input['content']) } catch (error) { throw new HttpError(422, (error as Error).message) }
    const workspace = store.workspace(student.id, tutorial.def.id)
    const generated = renderCase(tutorial, resolveParams(tutorial, workspace.values)).files.get(relPath)
    if (generated !== undefined && generated.trimEnd() === content.trimEnd()) delete workspace.overrides[relPath]
    else workspace.overrides[relPath] = content
    store.saveWorkspace(student.id, workspace)
    sendJSON(req, res, 200, workspaceView(student, tutorial, workspace))
    return
  }
  if (subRoute === 'DELETE /files') {
    const relPath = url.searchParams.get('path') ?? ''
    const workspace = store.workspace(student.id, tutorial.def.id)
    delete workspace.overrides[relPath]
    store.saveWorkspace(student.id, workspace)
    sendJSON(req, res, 200, workspaceView(student, tutorial, workspace))
    return
  }

  // ── Runs ──
  if (subRoute === 'POST /runs') {
    const workspace = store.workspace(student.id, tutorial.def.id)
    const { resolved, rendered, renderError } = resolveWorkspace(tutorial, workspace)
    const blocking = resolved.issues.find(issue => issue.level === 'error')
    if (blocking) throw new HttpError(422, blocking.message)
    if (!rendered) throw new HttpError(422, renderError ?? 'The case could not be generated')
    if (rendered.hash === referenceCases.get(tutorial.def.id)!.hash) {
      throw new HttpError(409, 'These are the reference settings: the Reference solution already shows their results. Change a setting first.')
    }
    let run = workspace.runs.find(candidate => candidate.hash === rendered.hash)
    if (run) {
      const state = describeHash(run.hash, false).status
      if (!['cancelled', 'error', 'interrupted'].includes(state)) {
        throw new HttpError(409, `Run ${run.number} already uses exactly these settings.`)
      }
    } else {
      if (workspace.runs.length >= config.maxRunsPerTutorial) {
        throw new HttpError(409, `You can keep ${config.maxRunsPerTutorial} runs per tutorial. Delete one you no longer need, then run again.`)
      }
    }
    const cached = results.read(rendered.hash)
    if (!cached) {
      if (!queue.computeOnline) throw new HttpError(503, 'The compute backend is offline right now. You can still explore the solved runs.')
      if (queue.activeFor(student.id).length > 0) throw new HttpError(409, 'You already have a run in progress. Wait for it to finish or cancel it.')
      if (!store.countRun(student, config.maxRunsPerDay)) throw new HttpError(429, `You have used today's ${config.maxRunsPerDay} runs. Try again tomorrow.`)
    }
    if (!run) {
      run = {
        id: randomUUID().replace(/-/g, '').slice(0, 10), number: workspace.nextRunNumber++, hash: rendered.hash, createdAt: new Date().toISOString(),
        changed: changedParams(tutorial, resolved.values), overridden: Object.keys(workspace.overrides),
      }
      workspace.runs.push(run)
    } else run.createdAt = new Date().toISOString()
    store.saveWorkspace(student.id, workspace)
    queue.submit(tutorial, rendered, student.id)
    sendJSON(req, res, 201, { runId: run.id, workspace: workspaceView(student, tutorial, workspace) })
    return
  }

  if (sub[0] === 'runs' && sub[1]) {
    const workspace = store.workspace(student.id, tutorial.def.id)
    const isReference = sub[1] === 'reference'
    const run = isReference ? null : workspace.runs.find(candidate => candidate.id === sub[1])
    if (!isReference && !run) throw new HttpError(404, 'Run not found')
    const hash = isReference ? referenceCases.get(tutorial.def.id)!.hash : run!.hash
    const action = `${method} /${sub.slice(2).join('/')}`

    if (action === 'DELETE /') {
      if (isReference) throw new HttpError(400, 'The reference solution cannot be deleted')
      queue.cancel(hash, student.id)
      workspace.runs = workspace.runs.filter(candidate => candidate.id !== run!.id)
      store.saveWorkspace(student.id, workspace)
      sendJSON(req, res, 200, workspaceView(student, tutorial, workspace))
      return
    }
    if (action === 'POST /cancel') {
      if (isReference) throw new HttpError(400, 'The reference solution cannot be cancelled')
      queue.cancel(hash, student.id)
      sendJSON(req, res, 200, workspaceView(student, tutorial, workspace))
      return
    }
    if (action === 'GET /log') {
      const from = Math.max(0, Number(url.searchParams.get('from')) || 0)
      const live = queue.liveLines(hash, from)
      if (live) { sendJSON(req, res, 200, { ...live, done: false, total: null }); return }
      if (results.read(hash)) {
        const lines = storedLogLines(hash)
        const tail = Number(url.searchParams.get('tail')) || 0
        const start = tail > 0 && !url.searchParams.has('from') ? Math.max(0, lines.length - tail) : Math.min(from, lines.length)
        const slice = lines.slice(start, start + 5000)
        sendJSON(req, res, 200, { lines: slice, start, next: start + slice.length, done: true, total: lines.length })
        return
      }
      const outcome = queue.outcome(hash)
      sendJSON(req, res, 200, { lines: outcome?.logTail ?? [], start: 0, next: outcome?.logTail.length ?? 0, done: true, total: outcome?.logTail.length ?? 0 })
      return
    }
    if (action === 'GET /log.txt') {
      if (!results.read(hash)) throw new HttpError(404, 'No stored log for this run')
      res.setHeader('Content-Disposition', `attachment; filename="${tutorial.def.id}-${isReference ? 'reference' : `run${run!.number}`}-log.txt"`)
      sendFile(req, res, results.logPath(hash), 'private, max-age=3600')
      return
    }
    if (action === 'GET /convergence') {
      const stored = results.read(hash) ? results.convergence(hash) : null
      if (stored) { sendJSON(req, res, 200, { ...stored, live: false, monitors: results.monitors(hash) }); return }
      // Live plot while the solver runs: re-parse the lines seen so far.
      const lines: string[] = []
      for (let from = 0; ;) {
        const chunk = queue.liveLines(hash, from)
        if (!chunk || !chunk.lines.length) break
        lines.push(...chunk.lines)
        from = chunk.next
      }
      const start = lines.findIndex(line => line.includes('──── Solver ────'))
      sendJSON(req, res, 200, { ...parseConvergence(start >= 0 ? lines.slice(start).join('\n') : ''), live: true, monitors: [] })
      return
    }
    if (action === 'GET /files') {
      if (!results.read(hash)) throw new HttpError(404, 'This run has no stored case files yet')
      sendJSON(req, res, 200, { files: results.inputs(hash) })
      return
    }
    if (action === 'GET /vtk/manifest') {
      if (results.read(hash)?.status !== 'succeeded') throw new HttpError(404, 'This run has no results')
      results.touch(hash)
      sendJSON(req, res, 200, { hash, ...results.manifest(hash) })
      return
    }
    if (action === 'GET /vtk/file') {
      if (results.read(hash)?.status !== 'succeeded') throw new HttpError(404, 'This run has no results')
      const relPath = url.searchParams.get('path') ?? ''
      const file = results.vtkFile(hash, relPath)
      if (!file) throw new HttpError(404, 'Result file not found')
      sendVtk(req, res, file)
      return
    }
  }
  throw new HttpError(404, 'Route not found')
}

async function handleAdmin(req: http.IncomingMessage, res: http.ServerResponse, method: string, parts: string[]): Promise<void> {
  const route = `${method} /${parts.join('/')}`
  if (route === 'GET /overview') {
    const cache = results.list()
    sendJSON(req, res, 200, {
      className: config.className,
      queue: queue.summary(),
      cache: { entries: cache.length, bytes: cache.reduce((sum, entry) => sum + entry.bytes, 0), maxBytes: config.cacheMaxBytes },
      image: OPENFOAM_IMAGE,
      tutorials: [...catalog.values()].map(tutorial => {
        const reference = referenceView(tutorial)
        return { id: tutorial.def.id, title: tutorial.def.title, reference: { status: reference.status, reason: reference.reason, durationMs: reference.result?.durationMs ?? null, cells: reference.result?.cells ?? null } }
      }),
      students: store.listStudents().map(student => ({
        id: student.id, name: student.name, createdAt: student.createdAt, lastSeenAt: student.lastSeenAt,
        runsToday: student.runDay === new Date().toISOString().slice(0, 10) ? student.runCount ?? 0 : 0,
        tutorials: Object.fromEntries(store.workspacesOf(student.id).map(workspace => [workspace.tutorialId, {
          runs: workspace.runs.length,
          succeeded: workspace.runs.filter(run => results.read(run.hash)?.status === 'succeeded').length,
          openedAt: workspace.openedAt, updatedAt: workspace.updatedAt,
        }])),
      })),
    })
    return
  }
  if (route === 'POST /rebake') {
    const input = await body(req)
    const ids = Array.isArray(input['tutorials']) ? input['tutorials'].filter((id): id is string => typeof id === 'string') : [...catalog.keys()]
    for (const id of ids) {
      const tutorial = catalog.get(id)
      if (!tutorial) continue
      const rendered = referenceCases.get(id)!
      if (input['force'] === true && !queue.job(rendered.hash)) results.remove(rendered.hash)
      queue.submit(tutorial, rendered, BAKE)
    }
    sendJSON(req, res, 200, { ok: true })
    return
  }
  if (parts[0] === 'students' && parts[1]) {
    const student = store.student(parts[1])
    if (!student) throw new HttpError(404, 'Student not found')
    if (method === 'POST' && parts[2] === 'reset-pin') {
      const input = await body(req)
      await store.resetPin(student.id, text(input, 'pin', 4, 64, 'PIN'))
      sendJSON(req, res, 200, { ok: true })
      return
    }
    if (method === 'DELETE' && parts.length === 2) {
      for (const job of queue.activeFor(student.id)) queue.cancel(job.hash, student.id)
      store.removeStudent(student.id)
      evictIfNeeded()
      sendJSON(req, res, 200, { ok: true })
      return
    }
  }
  throw new HttpError(404, 'Route not found')
}

function serveWeb(req: http.IncomingMessage, res: http.ServerResponse, url: URL): void {
  const root = config.webDir
  const requested = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '')
  let file = path.join(root, requested)
  if (!file.startsWith(root + path.sep) && file !== root) throw new HttpError(403, 'Forbidden')
  const isAsset = requested.startsWith('assets' + path.sep)
  if (!requested || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    if (isAsset || path.extname(requested)) throw new HttpError(404, 'Not found')
    file = path.join(root, 'index.html') // single-page app: every other path is a client route
  }
  if (!fs.existsSync(file)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('The web app has not been built yet. Run: npm run classroom:build\n')
    return
  }
  sendFile(req, res, file, isAsset ? 'public, max-age=31536000, immutable' : 'no-cache')
}

const server = http.createServer((req, res) => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value)
  void (async () => {
    const url = new URL(req.url ?? '/', 'http://classroom.local')
    if (url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok\n'); return }
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url)
    else if (req.method === 'GET' || req.method === 'HEAD') serveWeb(req, res, url)
    else throw new HttpError(405, 'Method not allowed')
  })().catch((error: unknown) => {
    const status = error instanceof HttpError ? error.status : 500
    if (status === 500) console.error('[http]', req.method, req.url, error)
    if (res.headersSent) { res.end(); return }
    const message = error instanceof HttpError ? error.message : 'Something went wrong on the server.'
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ error: message }))
  })
})

// ── Startup: make sure every tutorial has its reference solution ─────────────

async function prepareCompute(): Promise<void> {
  try {
    await docker.ping()
    await ensureOpenFoamImage(docker, { onProgress: () => undefined })
    queue.computeOnline = true
  } catch (error) {
    queue.computeOnline = false
    console.warn(`[compute] Docker/OpenFOAM is not available (${(error as Error).message}). Solved tutorials stay browsable; new runs are disabled.`)
    return
  }
  if (!config.autoBake) return
  for (const tutorial of catalog.values()) {
    const rendered = referenceCases.get(tutorial.def.id)!
    if (!results.read(rendered.hash)) {
      console.log(`[bake] solving reference for ${tutorial.def.id}`)
      queue.submit(tutorial, rendered, BAKE)
      void queue.wait(rendered.hash).then(result => {
        console.log(`[bake] ${tutorial.def.id}: ${result ? `${result.status}${result.reason ? `: ${result.reason}` : ''}` : 'did not finish'}`)
      })
    }
  }
}

// Re-probe Docker periodically so the site recovers on its own after an outage.
setInterval(() => {
  docker.ping().then(() => {
    if (!queue.computeOnline) void prepareCompute()
  }, () => { queue.computeOnline = false })
}, 30_000).unref()

let stopping = false
async function shutdown(): Promise<void> {
  if (stopping) return
  stopping = true
  queue.abortAll()
  server.close()
  await cleanupOwnedContainers()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())

server.listen(config.port, config.host, () => {
  console.log(`OpenFOAM Studio Classroom: ${config.className}`)
  console.log(`  listening on http://${config.host}:${config.port}`)
  console.log(`  ${catalog.size} tutorials, ${store.listStudents().length} students, data in ${config.dataDir}`)
  if (!config.classCode) console.warn('  WARNING: OFS_CLASS_CODE is not set: anyone who can reach this server can create an account.')
  if (!config.instructorCode) console.warn('  Instructor overview is disabled (set OFS_INSTRUCTOR_CODE to enable it).')
  void prepareCompute()
})
