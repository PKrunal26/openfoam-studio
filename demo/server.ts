import http from 'http'
import { allowLocalRequest } from '../core/http/localAccess.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID, timingSafeEqual } from 'crypto'
import { HttpError, readRequestBody, parseObject, stringField } from '../core/http/requests.js'
import { atomicWrite, projectFiles, inputFiles, copyCase, inputChanges, commitCaseInputs, caseRevision, checkedFile, normalizeLF } from '../core/project/files.js'
import { assertCaseExecutionPolicy, assertSafeDictionary } from '../core/run/casePolicy.js'
import { reconcileInterruptedProjects } from '../core/setup/runtimeLifecycle.js'
import { testProviderConnection } from '../core/setup/providerConnection.js'
import Docker from 'dockerode'
import { runAgentLoop } from '../core/agent/AgentLoop.js'
import { runClaudeAgent } from '../core/agent/ClaudeAgentRunner.js'
import { runCodexAgent } from '../core/agent/CodexAgentRunner.js'
import { repairHealthChecks, runHealthChecks } from '../core/health.js'
import { runDockerCommand, meshCheckPassed, cleanupOwnedContainers, OPENFOAM_IMAGE } from '../core/docker/CommandRunner.js'
import { classifyVtkFile, buildVtkSeries } from '../core/postprocess/vtkSeries.js'
import {
  loadApiKeyIntoEnv,
  initializeCredentialStore,
  removeProviderKeys,
  readConfig,
  writeConfig,
  getActiveProvider,
  getActiveModel,
  getProviderKey,
  hasLLMAuth,
  DEFAULT_MODEL,
  MODEL_OPTIONS,
  PROVIDER_LABELS,
  type LLMProvider,
  type AppConfig,
} from '../core/setup/appConfig.js'
import { runAllowedHostCommand } from '../core/setup/HostCommandRunner.js'
import type { Message } from '../core/agent/types.js'
import { diagnose } from '../core/agent/ErrorRecovery.js'
import type { DiagnosisResult, FileFix } from '../core/agent/ErrorRecovery.js'
import { applyFixes, FileFixSchema } from '../core/agent/applyFix.js'
import { inspectCaseReadiness, validateCaseInIsolation } from '../core/run/validateCase.js'
import { validateWrittenFields, type FieldValidation } from '../core/postprocess/fieldValidation.js'
import { buildRunCommands, VTK_EXPORT_FIELDS } from '../core/run/buildRunCommands.js'
import { diagnoseCase } from '../core/agent/diagnoseCase.js'
import { evaluateRunEvidence, type RunEvidence } from '../core/run/runEvidence.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.join(__dirname, '..')
// In the packaged Electron app, OFS_CONFIG_DIR is set to app.getPath('userData')
// so projects survive updates and are never stored inside the read-only app bundle.
const PROJECTS_DIR = process.env['OFS_CONFIG_DIR']
  ? path.join(process.env['OFS_CONFIG_DIR'], 'projects')
  : path.join(__dirname, 'projects')
const FIXTURE_DIR = path.join(PROJECT_ROOT, 'demo', 'starters', 'cavity')
const RENDERER_DIST = path.join(PROJECT_ROOT, 'renderer', 'dist')
const VITE_DEV_URL = process.env['OFS_VITE_URL'] ?? 'http://localhost:5173'
const USE_VITE_DEV = process.env['OFS_DEV'] === '1'
const PORT = Number(process.env['OFS_PORT']) || 3456
const APP_VERSION = (JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')) as { version: string }).version
const SESSION_TOKEN = process.env['OFS_SERVER_TOKEN'] || randomUUID()

const STATIC_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
}

function staticMime(file: string) {
  return STATIC_MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
}

function proxyToVite(req: http.IncomingMessage, res: http.ServerResponse) {
  const target = new URL(req.url ?? '/', VITE_DEV_URL)
  const upstream = http.request(
    {
      hostname: target.hostname,
      port: target.port || 80,
      path: target.pathname + target.search,
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (upRes) => {
      res.writeHead(upRes.statusCode ?? 200, upRes.headers)
      upRes.pipe(res)
    },
  )
  upstream.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/plain' })
    res.end(`Vite dev server unreachable at ${VITE_DEV_URL}: ${err.message}`)
  })
  req.pipe(upstream)
}

function serveRendererAsset(reqPath: string, res: http.ServerResponse): boolean {
  const indexFile = path.join(RENDERER_DIST, 'index.html')
  const hasBuild = fs.existsSync(indexFile)

  // SPA root → built renderer index.html. Never cache; always fresh.
  if (reqPath === '/' || reqPath === '/index.html') {
    if (hasBuild) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      res.end(fs.readFileSync(indexFile))
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('No frontend build available. Run `npm run build:renderer` or set OFS_DEV=1.')
    }
    return true
  }

  if (!hasBuild) return false

  const safeRel = reqPath.replace(/^\//, '')
  const resolved = path.normalize(path.join(RENDERER_DIST, safeRel))
  if (!resolved.startsWith(RENDERER_DIST)) return false
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return false

  // Vite hashes asset filenames — cache forever. Everything else: no-cache.
  const isHashedAsset = /\/assets\//.test(reqPath)
  const cacheControl = isHashedAsset
    ? 'public, max-age=31536000, immutable'
    : 'no-store'

  res.writeHead(200, { 'Content-Type': staticMime(resolved), 'Cache-Control': cacheControl })
  res.end(fs.readFileSync(resolved))
  return true
}
// Windows Docker Desktop exposes a named pipe instead of a Unix socket.
const docker = new Docker(
  process.platform === 'win32' ? { socketPath: '//./pipe/docker_engine' } : {}
)

// Load persisted ANTHROPIC_API_KEY (from user-facing settings) into process.env
// so selected provider invocations can authenticate.
await initializeCredentialStore()
loadApiKeyIntoEnv()

// ── Project helpers ───────────────────────────────────────────────────────────

interface ProjectMeta {
  id: string
  name: string
  prompt: string
  status: 'idle' | 'generating' | 'running' | 'ready' | 'done' | 'error' | 'draft' | 'needs-input' | 'unvalidated' | 'validation-failed' | 'interrupted'
  createdAt: string
  messages: Message[]
  retryCount: number
  example?: boolean
  latestRunId?: string
  revision?: string
  validation?: { ok: boolean; note: string; checkedAt: string }
}

function projectCaseDir(id: string) { return path.join(PROJECTS_DIR, id, 'case') }
function projectMetaPath(id: string) { return path.join(PROJECTS_DIR, id, 'meta.json') }
function projectRunsJsonl(id: string) { return path.join(PROJECTS_DIR, id, 'runs.jsonl') }
function projectCommandsJsonl(id: string) { return path.join(PROJECTS_DIR, id, 'commands.jsonl') }
function projectRunsLogDir(id: string) { return path.join(PROJECTS_DIR, id, 'runs') }
function projectRunLogPath(id: string, runId: string) {
  return path.join(projectRunsLogDir(id), `${runId}.log`)
}

// ── Runs / Commands persistence ──────────────────────────────────────────────

interface RunRecord {
  id: string
  startedAt: string
  finishedAt?: string
  status: 'running' | 'success' | 'failed' | 'aborted' | 'exhausted' | 'reference'
  exits: { cmd: string; code: number }[]
  errorMessage?: string
  inputRevision?: string
  image?: string
  imageDigest?: string
  provider?: string
  model?: string
  validation?: { meshChecked: boolean; solverCompleted: boolean; finiteFields: boolean; finalTime?: number | null; requestedEndTime?: number | null; continuity?: RunEvidence['continuity']; logEvidenceScope?: 'last-10000-solver-lines'; benchmark: 'not-run'; warnings: string[] }
}

interface CommandRecord {
  runId: string
  ts: string
  cmd: string
  args: string[]
  status: 'success' | 'failed' | 'error'
  exitCode?: number
  durationMs: number
  errorMessage?: string
}

function appendJsonl(file: string, obj: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, JSON.stringify(obj) + '\n', 'utf8')
}

function readJsonl<T>(file: string): T[] {
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line) as T } catch { return null }
    })
    .filter((v): v is T => v !== null)
}

function updateRunRecord(projectId: string, runId: string, patch: Partial<RunRecord>) {
  const file = projectRunsJsonl(projectId)
  const records = readJsonl<RunRecord>(file)
  const idx = records.findIndex(r => r.id === runId)
  if (idx < 0) return
  records[idx] = { ...records[idx]!, ...patch }
  atomicWrite(file, records.map(r => JSON.stringify(r)).join('\n') + '\n')
}

function readMeta(id: string): ProjectMeta | null {
  try { return JSON.parse(fs.readFileSync(projectMetaPath(id), 'utf8')) } catch { return null }
}

function writeMeta(id: string, meta: ProjectMeta) {
  fs.mkdirSync(path.dirname(projectMetaPath(id)), { recursive: true })
  atomicWrite(projectMetaPath(id), JSON.stringify(meta, null, 2))
}

function listProjects(): ProjectMeta[] {
  if (!fs.existsSync(PROJECTS_DIR)) return []
  return fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => readMeta(e.name))
    .filter((m): m is ProjectMeta => m !== null && typeof m.createdAt === 'string')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// ── File helpers ──────────────────────────────────────────────────────────────

const getAllFiles = projectFiles

// ── SSE helpers ───────────────────────────────────────────────────────────────

function sseHeaders(res: http.ServerResponse) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })
}

function sseWrite(res: http.ServerResponse, data: object) {
  if (!res.destroyed && !res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`)
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

const readBody = readRequestBody

const activeJobs = new Map<string, AbortController>()
async function withProjectJob(id: string, res: http.ServerResponse, work: (signal: AbortSignal) => Promise<void>) {
  if (activeJobs.has(id)) throw new HttpError(409, 'This project already has an active operation. Stop it before changing the case.')
  const controller = new AbortController()
  activeJobs.set(id, controller)
  const disconnected = () => { if (!res.writableEnded) controller.abort(new Error('Client disconnected')) }
  res.on('close', disconnected)
  const timer = setTimeout(() => controller.abort(new Error('Operation exceeded its 30 minute limit')), 30 * 60_000)
  try { await work(controller.signal) } finally {
    clearTimeout(timer)
    res.off('close', disconnected)
    activeJobs.delete(id)
  }
}

function selectedRun(id: string, requested?: string | null): RunRecord | undefined {
  const runId = requested || readMeta(id)?.latestRunId
  if (!runId) return undefined
  if (!/^[a-zA-Z0-9-]+$/.test(runId)) throw new HttpError(400, 'Invalid run ID')
  const run = readJsonl<RunRecord>(projectRunsJsonl(id)).find(record => record.id === runId)
  if (requested && !run) throw new HttpError(404, 'Run not found')
  return run
}

function resultsCaseDir(id: string, requested?: string | null): string {
  const run = selectedRun(id, requested)
  const archived = run ? path.join(PROJECTS_DIR, id, 'runs', run.id, 'case') : undefined
  return archived ?? projectCaseDir(id)
}

// ── Request handlers ──────────────────────────────────────────────────────────

async function handleGenerate(projectId: string, req: http.IncomingMessage, res: http.ServerResponse, signal: AbortSignal) {
  const payload = parseObject(await readBody(req))
  const prompt = (stringField(payload, 'prompt') ?? '').trim()
  checkPayloadKeys(payload, ['prompt', 'intent'])
  const intent = stringField(payload, 'intent', 20)
  if (intent && !['question', 'edit'].includes(intent)) throw new HttpError(400, 'Unknown request intent')
  const meta = readMeta(projectId)
  if (!meta) throw new HttpError(404, 'Project not found')
  const currentCase = projectCaseDir(projectId)
  const transactionId = randomUUID()
  const transactionRoot = path.join(PROJECTS_DIR, projectId, 'jobs', transactionId)
  const caseDir = path.join(transactionRoot, 'case')
  const backupCase = path.join(PROJECTS_DIR, projectId, 'revisions', transactionId, 'case')
  let committed = false
  let metadataCommitted = false
  const hadInputs = inputFiles(currentCase).length > 0
  const readOnly = intent === 'question' || (!intent && /^(?:what\b|why\b|explain\b|describe (?:this|the current|my)\b|can you explain\b|how does\b|how do I\b)/i.test(prompt))
  copyCase(currentCase, caseDir, true)
  const initialRevision = caseRevision(currentCase)
  sseHeaders(res)
  const messages: Message[] = [...(meta.messages ?? []), ...(prompt ? [{ role: 'user' as const, content: prompt, timestamp: new Date().toISOString() }] : [])]
  writeMeta(projectId, { ...meta, status: 'generating', messages })
  const steps: import('../core/agent/types.js').PersistedAgentStep[] = []
  const stepById = new Map<string, import('../core/agent/types.js').PersistedAgentStep>()
  const onEvent = (event: import('../core/agent/tools.js').AgentEvent) => {
    if (event.type === 'file') return
    if (event.type === 'tool-call') {
      const args = event.args && typeof event.args === 'object' ? event.args as Record<string, unknown> : {}
      const summary = [args['path'], args['query'], args['cmd']].find(value => typeof value === 'string') as string | undefined
      const step = { tool: event.tool, ok: false, ...(summary ? { summary } : {}) }
      steps.push(step); stepById.set(event.id, step)
    } else if (event.type === 'tool-result') {
      const step = stepById.get(event.id)
      if (step) { step.ok = event.ok; step.durationMs = event.durationMs }
    }
    sseWrite(res, event)
  }
  try {
    let summary = ''
    if (!prompt) {
      if (hadInputs) throw new HttpError(409, 'This case already has inputs. Create a new starter project instead of replacing it.')
      if (!inputFiles(FIXTURE_DIR).length) throw new Error('Bundled cavity starter is missing. Reinstall the app.')
      copyCase(FIXTURE_DIR, caseDir, true)
      summary = 'Loaded the cavity starter: Re=100, laminar incompressible flow. Review the inputs, then Run to check the mesh and solve.'
    } else {
      sseWrite(res, { type: 'status', message: readOnly ? 'Reading the case to answer your question…' : 'Preparing a recoverable case revision…' })
      const history = meta.messages ?? []
      const contextualPrompt = hadInputs
        ? `${prompt}\n\nThis case already exists. Preserve all unrelated settings and files. A question needs an explanation, not a new case.`
        : prompt
      const result = getActiveProvider() === 'codex-cli'
        ? await runCodexAgent({ caseDir, prompt: contextualPrompt, history, onEvent, signal, readOnly })
        : getActiveProvider() === 'claude-cli'
        ? await runClaudeAgent({ caseDir, prompt: contextualPrompt, history, onEvent, signal, readOnly })
        : await runAgentLoop({ caseDir, prompt: contextualPrompt, history, docker, onEvent, signal, readOnly })
      summary = result.finishSummary || result.finalText || ''
    }
    signal.throwIfAborted()
    let changed = inputChanges(currentCase, caseDir)
    if (readOnly && changed.length) throw new Error('Explanation requests cannot change case inputs')
    let validation: ValidationOutcome | null = null
    if (changed.length) {
      assertCaseExecutionPolicy(caseDir)
      if (prompt) {
        sseWrite(res, { type: 'status', message: 'Checking mesh quality and a bounded solver run…' })
        validation = await validateGeneratedCase(caseDir, onEvent, signal)
        if (validation) summary += `\n\n${validation.note}`
      }
      signal.throwIfAborted()
      if (caseRevision(currentCase) !== initialRevision) throw new HttpError(409, 'Case inputs changed during generation. The staged revision was not applied.')
      changed = inputChanges(currentCase, caseDir)
      commitCaseInputs(currentCase, caseDir, backupCase)
      committed = true
    }
    const status: ProjectMeta['status'] = changed.length
      ? !prompt ? 'draft' : validation === null || validation.status === 'unvalidated' ? 'unvalidated' : validation.ok ? 'ready' : 'validation-failed'
      : hadInputs ? meta.status : 'needs-input'
    const answer = summary.trim() || (changed.length ? `Updated ${changed.length} case files.` : 'No case files changed. Describe the missing simulation details to continue.')
    const next: ProjectMeta = {
      ...readMeta(projectId)!, status, revision: caseRevision(currentCase),
      messages: [...messages, { role: 'assistant', content: answer, timestamp: new Date().toISOString(), filesChanged: changed, agentSteps: steps }],
      ...(changed.length ? { validation: { ok: validation?.ok ?? false, note: validation?.note ?? 'Inputs have not been validated yet.', checkedAt: new Date().toISOString() } } : {}),
    }
    writeMeta(projectId, next)
    metadataCommitted = true
    for (const relative of changed) sseWrite(res, { type: 'file', path: relative, content: fs.readFileSync(path.join(currentCase, relative), 'utf8') })
    sseWrite(res, { type: 'finish-summary', summary: answer })
    sseWrite(res, { type: 'done', status, files: changed, revision: next.revision })
  } catch (error) {
    if (committed && !metadataCommitted && fs.existsSync(backupCase)) {
      const failedCase = path.join(path.dirname(backupCase), 'failed-case')
      fs.renameSync(currentCase, failedCase)
      fs.renameSync(backupCase, currentCase)
    }
    const message = metadataCommitted ? 'The case revision was saved, but its response could not be delivered. Reload the project to see the saved revision.' : signal.aborted ? 'Operation stopped. The previous case inputs were preserved.' : error instanceof Error ? error.message : String(error)
    if (!metadataCommitted) writeMeta(projectId, { ...meta, messages, status: hadInputs ? meta.status : 'idle' })
    sseWrite(res, { type: 'error', message })
    sseWrite(res, { type: 'done', status: signal.aborted ? 'aborted' : 'failed' })
  } finally {
    fs.rmSync(transactionRoot, { recursive: true, force: true })
    res.end()
  }
}

async function handleRun(projectId: string, req: http.IncomingMessage, res: http.ServerResponse, signal: AbortSignal) {
  const meta = readMeta(projectId)
  if (!meta) { res.writeHead(404); res.end('Project not found'); return }

  const sourceCase = projectCaseDir(projectId)
  if (!inputFiles(sourceCase).length) throw new HttpError(409, 'No case inputs found. Open the cavity starter or generate a case first.')
  assertCaseExecutionPolicy(sourceCase)
  const readiness = inspectCaseReadiness(sourceCase)
  if (!readiness.ok) throw new HttpError(422, [...readiness.missing.map(file => `Missing ${file}`), ...readiness.errors].join('; '))
  signal.throwIfAborted()
  const runId = randomUUID().slice(0, 8)
  const caseDir = path.join(PROJECTS_DIR, projectId, 'runs', runId, 'case')
  copyCase(sourceCase, caseDir, true)
  const inputRevision = caseRevision(caseDir)
  atomicWrite(path.join(PROJECTS_DIR, projectId, 'runs', runId, 'inputs.json'), JSON.stringify(Object.fromEntries(inputFiles(caseDir).map(file => [file.relPath, fs.readFileSync(file.path, 'utf8')])), null, 2))
  sseHeaders(res)

  // ── Run record + log capture ──────────────────────────────────────────────
  const runRecord: RunRecord = {
    id: runId,
    startedAt: new Date().toISOString(),
    status: 'running',
    exits: [],
    inputRevision,
    image: OPENFOAM_IMAGE,
    provider: getActiveProvider(),
    model: getActiveModel(),
  }
  try { runRecord.imageDigest = (await Promise.race([docker.getImage(OPENFOAM_IMAGE).inspect(), new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error('Image inspection timed out')), 5_000); timer.unref() })])).Id } catch { /* execution reports image failure */ }
  signal.throwIfAborted()
  appendJsonl(projectRunsJsonl(projectId), runRecord)
  try {
    writeMeta(projectId, { ...meta, status: 'running', retryCount: meta.retryCount ?? 0, latestRunId: runId, revision: inputRevision })
  } catch (error) {
    updateRunRecord(projectId, runId, { status: 'failed', finishedAt: new Date().toISOString(), errorMessage: 'Run metadata could not be saved; execution was not started.' })
    throw error
  }
  fs.mkdirSync(projectRunsLogDir(projectId), { recursive: true })
  const runLogStream = fs.createWriteStream(projectRunLogPath(projectId, runId), { flags: 'w' })
  let logError: Error | undefined
  runLogStream.on('error', error => { logError = error })
  const writeRunLog = (line: string) => { if (!logError && !runLogStream.destroyed) runLogStream.write(line + '\n') }

  let clientAborted = signal.aborted
  const runAbort = { signal }
  const onClose = () => { clientAborted = true }
  signal.addEventListener('abort', onClose, { once: true })

  let runFinalized = false
  const finalizeRun = (
    status: RunRecord['status'],
    exits: { cmd: string; code: number }[],
    errorMessage?: string,
  ) => {
    if (runFinalized) return
    runFinalized = true
    updateRunRecord(projectId, runId, {
      finishedAt: new Date().toISOString(),
      status,
      exits,
      ...(errorMessage ? { errorMessage } : {}),
      validation: { meshChecked, solverCompleted: runEvidence?.completed ?? false, finiteFields: fieldCheck?.ok ?? false, finalTime: runEvidence?.finalTime, requestedEndTime: runEvidence?.endTime, continuity: runEvidence?.continuity, logEvidenceScope: 'last-10000-solver-lines', benchmark: 'not-run', warnings: exportWarnings },
    })
    runLogStream.end()
  }

  sseWrite(res, { type: 'run-started', runId })

  // Pipeline: blockMesh → [setFields if VoF] → foamToVTK(mesh) → foamRun → foamToVTK(all)
  const commands = buildRunCommands(caseDir)

  let solverOk = false
  let runEvidence: RunEvidence | undefined
  let fieldCheck: FieldValidation | undefined
  let meshChecked = false
  const exportWarnings: string[] = []
  const logBuffer: string[] = []
  const exitsCollected: { cmd: string; code: number }[] = []
  let runErrorMessage: string | undefined

  // Residual tracking: iteration increments each time we see "Time ="
  const RESIDUAL_RE = /Solving for (\w+), Initial residual = ([\d.eE+-]+)/
  const TIME_STEP_RE = /^Time = /
  let iterationIndex = 0

  // Stall detection: if Docker goes silent for >10 s, send a heartbeat log line
  const runStart = Date.now()
  let lastLogTime = Date.now()
  const dockerHeartbeat = setInterval(() => {
    if (Date.now() - lastLogTime > 10_000) {
      const s = Math.round((Date.now() - runStart) / 1000)
      sseWrite(res, { type: 'log', line: `  ⏳ still running… (${s}s)` })
    }
  }, 5000)

  let exhausted = false

  try {
  for (const { cmd, args } of commands) {
    // Stop button / closed window: don't start the next pipeline stage.
    if (clientAborted) break
    const header = `\n> ${cmd} ${args.join(' ')}`
    sseWrite(res, { type: 'log', line: header })
    writeRunLog(header)
    const cmdStart = Date.now()
    const commandLines: string[] = []
    try {
      let exitCode = await runDockerCommand(docker, {
        command: cmd,
        args,
        caseDir,
        signal: runAbort.signal,
        onLine: line => {
          commandLines.push(line)
          if (commandLines.length > 10_000) commandLines.shift()
          lastLogTime = Date.now()
          if (cmd === 'foamRun') {
            logBuffer.push(line)
            if (logBuffer.length > 10_000) logBuffer.shift()
            if (TIME_STEP_RE.test(line)) iterationIndex++
            const m = RESIDUAL_RE.exec(line)
            if (m) {
              sseWrite(res, {
                type: 'residual',
                field: m[1],
                iteration: iterationIndex,
                value: parseFloat(m[2]!),
              })
            }
          }
          sseWrite(res, { type: 'log', line })
          writeRunLog(line)
        },
      })
      if (cmd === 'checkMesh') {
        meshChecked = meshCheckPassed(exitCode, commandLines.join('\n'))
        if (!meshChecked) exitCode = exitCode || 1
      }
      const exitLine = `\n[${cmd} exited with code ${exitCode}]`
      sseWrite(res, { type: 'log', line: exitLine })
      writeRunLog(exitLine)
      sseWrite(res, { type: 'exit', cmd, code: exitCode })
      exitsCollected.push({ cmd, code: exitCode })
      appendJsonl(projectCommandsJsonl(projectId), {
        runId,
        ts: new Date(cmdStart).toISOString(),
        cmd,
        args,
        status: exitCode === 0 ? 'success' : 'failed',
        exitCode,
        durationMs: Date.now() - cmdStart,
      } satisfies CommandRecord)
      if (exitCode !== 0) {
        // A kill from the Stop button shows up as a non-zero exit — that's an
        // abort, not a solver failure. Skip diagnosis and error status.
        if (clientAborted) break
        // foamToVTK is non-essential — the geometry tab degrades gracefully if
        // the mesh export fails. Don't fail the run on its account.
        if (cmd === 'foamToVTK') {
          exportWarnings.push(`VTK export failed (exit ${exitCode}); results may be incomplete.`)
          // OF13 incompressibleVoF writes literal `nan` into the reconstructed
          // p field, which foamToVTK refuses to parse — everything else in the
          // case is fine. Retry once without p so the Results tab still gets
          // U/p_rgh/alpha data instead of nothing.
          const fieldsIdx = args.indexOf('-fields')
          const fieldsArg = fieldsIdx >= 0 ? args[fieldsIdx + 1] : undefined
          if (fieldsArg && /(?<![\w.])p(?![\w.])/.test(fieldsArg)) {
            const withoutP = fieldsArg.replace(/(?<![\w.])p(?![\w.])\s*/, '').replace(/\(\s+/, '(')
            const retryArgs = [...args]
            retryArgs[fieldsIdx + 1] = withoutP
            const retryLine = `[foamToVTK failed (exit ${exitCode}); retrying without the p field]`
            sseWrite(res, { type: 'log', line: retryLine })
            writeRunLog(retryLine)
            try {
              const retryExit = await runDockerCommand(docker, {
                command: 'foamToVTK',
                args: retryArgs,
                caseDir,
                signal: runAbort.signal,
                onLine: line => {
                  lastLogTime = Date.now()
                  sseWrite(res, { type: 'log', line })
                  writeRunLog(line)
                },
              })
              const retryDone = `[foamToVTK retry exited with code ${retryExit}]`
              sseWrite(res, { type: 'log', line: retryDone })
              writeRunLog(retryDone)
              if (retryExit === 0) continue
            } catch { /* fall through to skip */ }
          }
          const skipLine = `[foamToVTK failed (exit ${exitCode}); geometry export skipped]`
          sseWrite(res, { type: 'log', line: skipLine })
          writeRunLog(skipLine)
          continue
        }
        const currentMeta = readMeta(projectId)!
        writeMeta(projectId, { ...currentMeta, status: 'error' })
        runErrorMessage = `${cmd} failed (exit ${exitCode})`
        sseWrite(res, { type: 'error', message: runErrorMessage })

        if (cmd === 'foamRun') {
          if ((currentMeta.retryCount ?? 0) >= 3) {
            exhausted = true
            sseWrite(res, { type: 'exhausted' })
          } else {
            const fullLog = logBuffer.join('\n')
            const diagnosis = diagnose(fullLog, Object.fromEntries(inputFiles(caseDir).filter(file => fs.statSync(file.path).size < 512_000).map(file => [file.relPath, fs.readFileSync(file.path, 'utf8')])))
            if (diagnosis && diagnosis.fix.length) {
              sseWrite(res, { type: 'diagnosis', result: diagnosis })
            } else {
              const askLine = '\n[Asking the selected model to diagnose the error...]'
              sseWrite(res, { type: 'log', line: askLine })
              writeRunLog(askLine)
              const aiDiagnosis = await modelDiagnose(logBuffer.slice(-60).join('\n'), caseDir, signal)
              if (aiDiagnosis && aiDiagnosis.fix.length > 0) {
                sseWrite(res, { type: 'diagnosis', result: aiDiagnosis })
              } else {
                sseWrite(res, { type: 'unknown-error', log: logBuffer.slice(-50).join('\n') })
              }
            }
          }
        }
        break
      }
      if (cmd === 'foamRun') {
        runEvidence = evaluateRunEvidence(logBuffer.join('\n'), fs.readFileSync(path.join(caseDir, 'system', 'controlDict'), 'utf8'))
        fieldCheck = validateWrittenFields(caseDir, { startTime: runEvidence.startTime ?? 0 })
        const issues = [...runEvidence.issues, ...fieldCheck.issues]
        if (!/Solving for\s+\w+/.test(logBuffer.join('\n'))) issues.push('No field solution was recorded')
        const diverged = !runEvidence.ok || !fieldCheck.ok || issues.length ? { field: issues.join('; '), time: String(fieldCheck.time ?? 'unknown') } : null
        if (diverged) {
          const currentMeta = readMeta(projectId)!
          writeMeta(projectId, { ...currentMeta, status: 'error' })
          runErrorMessage = `Numerical output verification failed at t=${diverged.time}: ${diverged.field}`
          const divLine = `\n[${runErrorMessage}]`
          sseWrite(res, { type: 'log', line: divLine })
          writeRunLog(divLine)
          sseWrite(res, { type: 'error', message: runErrorMessage })
          if ((currentMeta.retryCount ?? 0) >= 3) {
            exhausted = true
            sseWrite(res, { type: 'exhausted' })
          } else {
            // Route divergence through the same diagnosis → apply-fix loop as
            // a fatal. Rule-based diagnose() keys off log text, so append an
            // explicit divergence marker for the LLM fallback.
            const divergenceNote =
              `NUMERICAL OUTPUT VERIFICATION FAILED: ${diverged.field} at time ${diverged.time}. ` +
              `Typical causes: time step too large for the physics (reduce maxDeltaT / add maxAlphaCo), ` +
              `missing or wrong pressure reference, bad initial conditions, or unbounded interface compression.`
            const askLine = '\n[Asking the model to diagnose the divergence...]'
            sseWrite(res, { type: 'log', line: askLine })
            writeRunLog(askLine)
            const aiDiagnosis = await modelDiagnose(
              `${logBuffer.slice(-50).join('\n')}\n\n${divergenceNote}`,
              caseDir,
              signal,
            )
            if (aiDiagnosis && aiDiagnosis.fix.length > 0) {
              sseWrite(res, { type: 'diagnosis', result: aiDiagnosis })
            } else {
              sseWrite(res, { type: 'unknown-error', log: `${logBuffer.slice(-40).join('\n')}\n${divergenceNote}` })
            }
          }
          break
        }
        solverOk = true
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      appendJsonl(projectCommandsJsonl(projectId), {
        runId,
        ts: new Date(cmdStart).toISOString(),
        cmd,
        args,
        status: 'error',
        durationMs: Date.now() - cmdStart,
        errorMessage: message,
      } satisfies CommandRecord)
      if (clientAborted) break
      // foamToVTK throw is non-fatal — keep going to the solver.
      if (cmd === 'foamToVTK') {
        exportWarnings.push(`VTK export failed: ${message}`)
        const skipLine = `[foamToVTK threw: ${message}; geometry export skipped]`
        sseWrite(res, { type: 'log', line: skipLine })
        writeRunLog(skipLine)
        continue
      }
      writeMeta(projectId, { ...readMeta(projectId)!, status: 'error' })
      const errLine = `ERROR: ${message}`
      sseWrite(res, { type: 'log', line: errLine })
      writeRunLog(errLine)
      sseWrite(res, { type: 'error', message })
      runErrorMessage = message
      break
    }
  }

  } catch (error) {
    runErrorMessage = error instanceof Error ? error.message : String(error)
    solverOk = false
    sseWrite(res, { type: 'error', message: runErrorMessage })
  } finally {
    clearInterval(dockerHeartbeat)
    signal.removeEventListener('abort', onClose)
  }
  clientAborted = signal.aborted
  if (logError) exportWarnings.push(`Run log could not be fully saved: ${logError.message}`)

  if (solverOk) writeMeta(projectId, { ...readMeta(projectId)!, status: 'done', validation: { ok: true, note: 'Mesh checks passed, the requested solver end time was reached, and saved fields passed finite-value checks. Physics benchmark was not run for this result.', checkedAt: new Date().toISOString() } })
  // Aborted runs are not failures — the case files are still intact.
  else if (clientAborted) writeMeta(projectId, { ...readMeta(projectId)!, status: 'interrupted' })
  else writeMeta(projectId, { ...readMeta(projectId)!, status: 'error' })

  const finalStatus: RunRecord['status'] = clientAborted
    ? 'aborted'
    : solverOk
      ? 'success'
      : exhausted
        ? 'exhausted'
        : 'failed'
  finalizeRun(finalStatus, exitsCollected, runErrorMessage)

  sseWrite(res, { type: 'done', status: finalStatus, runId, inputRevision, warnings: exportWarnings })
  res.end()
}

// POST /api/projects/<id>/postprocess → SSE re-run of foamToVTK on a solved
// case (e.g. projects solved before the Results tab existed, or to convert a
// different field set). Body: { fields?: string[] } — omit for the default set.
async function handlePostprocess(projectId: string, req: http.IncomingMessage, res: http.ServerResponse, signal: AbortSignal) {
  const meta = readMeta(projectId)
  if (!meta) { res.writeHead(404); res.end('Project not found'); return }
  const parsed = parseObject(await readBody(req))
  checkPayloadKeys(parsed, ['fields', 'runId'])
  const requestedRun = stringField(parsed, 'runId', 80)
  const run = selectedRun(projectId, requestedRun)
  const caseDir = resultsCaseDir(projectId, requestedRun)
  if (!fs.existsSync(caseDir)) throw new HttpError(409, 'No case results to convert')
  assertCaseExecutionPolicy(caseDir)
  const fields = parsed['fields']
  if (fields !== undefined && (!Array.isArray(fields) || fields.length > 50 || !fields.every(field => typeof field === 'string' && /^[A-Za-z0-9_.:]+$/.test(field)))) throw new HttpError(400, 'Invalid field names')
  signal.throwIfAborted()
  let conversionStatus = 'failed'
  sseHeaders(res)
  const fieldArg = Array.isArray(fields) ? `(${fields.join(' ')})` : VTK_EXPORT_FIELDS
  const args = ['-case', '/cavity', '-ascii', '-useTimeName', '-fields', fieldArg]
  sseWrite(res, { type: 'log', line: `\n> foamToVTK ${args.join(' ')}` })
  const cmdStart = Date.now()
  try {
    const exitCode = await runDockerCommand(docker, {
      command: 'foamToVTK',
      args,
      caseDir,
      signal,
      onLine: (line) => sseWrite(res, { type: 'log', line }),
    })
    conversionStatus = exitCode === 0 ? 'success' : 'failed'
    sseWrite(res, { type: 'exit', cmd: 'foamToVTK', code: exitCode })
    appendJsonl(projectCommandsJsonl(projectId), {
      runId: run?.id ?? `post-${randomUUID().slice(0, 8)}`,
      ts: new Date(cmdStart).toISOString(),
      cmd: 'foamToVTK',
      args,
      status: exitCode === 0 ? 'success' : 'failed',
      exitCode,
      durationMs: Date.now() - cmdStart,
    } satisfies CommandRecord)
    if (exitCode !== 0) sseWrite(res, { type: 'error', message: `foamToVTK failed (exit ${exitCode})` })
  } catch (err) {
    sseWrite(res, { type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
  sseWrite(res, { type: 'done', status: signal.aborted ? 'aborted' : conversionStatus, runId: run?.id })
  res.end()
}

// ── Post-generation validation ────────────────────────────────────────────────
// The backend validates every provider against the same isolated pipeline.
// Validation makes no edits to the project and establishes no physics accuracy.
interface ValidationOutcome {
  ok: boolean
  note: string
  fixedFiles: string[]
  status: 'validated' | 'failed' | 'unvalidated' | 'cancelled'
}

/** Complete written-field verification, including missing/binary/non-finite fields. */
function findDivergedField(caseDir: string): { field: string; time: string; reason: string } | null {
  const control = fs.readFileSync(path.join(caseDir, 'system', 'controlDict'), 'utf8')
  const startTime = Number(/\bstartTime\s+([\d.eE+-]+)\s*;/.exec(control)?.[1] ?? 0)
  const fields = validateWrittenFields(caseDir, { startTime })
  return fields.ok ? null : { field: fields.issues[0] ?? 'Unverified written fields', time: fields.time === null ? 'none' : String(fields.time), reason: fields.issues.join('; ') }
}

/** Numeric solver-output time directories (0.02, 1e-05, …) — never "0". */
function listTimeDirs(caseDir: string): Set<string> {
  const out = new Set<string>()
  if (!fs.existsSync(caseDir)) return out
  for (const entry of fs.readdirSync(caseDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '0') continue
    if (/^\d+(\.\d+)?([eE][+-]?\d+)?$/.test(entry.name)) out.add(entry.name)
  }
  return out
}

async function validateGeneratedCase(
  caseDir: string,
  onEvent: (e: import('../core/agent/tools.js').AgentEvent) => void,
  signal: AbortSignal,
): Promise<ValidationOutcome> {
  if (signal.aborted) return { ok: false, status: 'cancelled', note: 'Validation stopped. The case has not been validated.', fixedFiles: [] }
  const readiness = inspectCaseReadiness(caseDir)
  if (!readiness.ok) return { ok: false, status: 'failed', note: `Validation prerequisites failed: ${[...readiness.missing.map(name => `Missing ${name}`), ...readiness.errors].join('; ')}.`, fixedFiles: [] }
  let activeCommand = ''
  let commandStarted = Date.now()
  let lastProgress = 0
  try {
    const result = await validateCaseInIsolation(docker, caseDir, {
      signal,
      steps: 5,
      onCommand: (command, phase, ok) => {
        const id = `validate_${command}`
        if (phase === 'start') {
          activeCommand = command
          commandStarted = Date.now()
          onEvent({ type: 'tool-call', id, tool: 'run_command', args: { cmd: command, isolated: true } })
        } else {
          onEvent({ type: 'tool-result', id, tool: 'run_command', ok: ok === true, preview: ok ? `${command} validation passed` : `${command} validation failed`, durationMs: Date.now() - commandStarted })
          activeCommand = ''
        }
      },
      onLine: line => {
        if (Date.now() - lastProgress >= 150) {
          onEvent({ type: 'tool-progress', id: `validate_${activeCommand}`, line })
          lastProgress = Date.now()
        }
      },
    })
    return result.ok
      ? { ok: true, status: 'validated', note: 'Isolated validation passed: mesh checked, short solver run advanced, and written internal fields passed finite-value checks. Convergence and physical accuracy have not been established.', fixedFiles: [] }
      : { ok: false, status: 'failed', note: `Isolated validation failed at ${result.failedCommand ?? 'solver validation'}: ${preview40Lines(result.fields?.issues.join('; ') || result.log)}. Inspect the log and review a proposed correction before running.`, fixedFiles: [] }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (activeCommand) onEvent({ type: 'tool-result', id: `validate_${activeCommand}`, tool: 'run_command', ok: false, preview: message, durationMs: Date.now() - commandStarted })
    return { ok: false, status: signal.aborted ? 'cancelled' : 'unvalidated', note: signal.aborted ? 'Validation stopped. The case has not been validated.' : `Validation could not complete: ${message}. The case is unvalidated.`, fixedFiles: [] }
  }
}

function preview40Lines(text: string, max = 400): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

/** Keep the server wrapper stable while sharing context-aware recovery in core. */
async function modelDiagnose(log: string, caseDir: string, signal?: AbortSignal): Promise<DiagnosisResult | null> {
  return diagnoseCase(log, caseDir, signal)
}

import { ARCHIVE_BODY_LIMIT, parseProjectArchive } from '../core/http/projectArchive.js'
import { createTextRedactor, redactObject } from '../core/http/redaction.js'
import { checkCodexAuthentication, checkClaudeAuthentication } from '../core/setup/providerConnection.js'

// ── Server ────────────────────────────────────────────────────────────────────

let settingsWriteQueue: Promise<void> = Promise.resolve()
function serializeSettings<T>(work: () => Promise<T>): Promise<T> {
  const operation = settingsWriteQueue.then(work)
  settingsWriteQueue = operation.then(() => undefined, () => undefined)
  return operation
}

function respondJSON(res: http.ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(value))
}

function setSessionCookie(res: http.ServerResponse) {
  res.setHeader('Set-Cookie', `ofs_session=${encodeURIComponent(SESSION_TOKEN)}; Path=/; HttpOnly; SameSite=Strict`)
}

function authorizedSession(req: http.IncomingMessage): boolean {
  const header = req.headers['x-ofs-token']
  const cookie = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('ofs_session='))
  let token = typeof header === 'string' ? header : undefined
  if (!token && cookie) {
    try { token = decodeURIComponent(cookie.slice('ofs_session='.length)) } catch { return false }
  }
  if (!token || token.length > 512) return false
  const supplied = Buffer.from(token)
  const expected = Buffer.from(SESSION_TOKEN)
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

function requireIdleProject(id: string) {
  if (activeJobs.has(id)) throw new HttpError(409, 'This project has an active operation. Stop it before changing the case.')
}

function requestCaseFile(root: string, relative: string, mustExist = true): string {
  if (relative.includes('\\') || relative.split('/').some(part => !part || part === '.' || part === '..' || /[:\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new HttpError(400, 'Invalid portable relative file path')
  let file: string
  try {
    file = checkedFile(root, relative)
    // Check ancestors above the case/VTK root too, including run folders.
    checkedFile(PROJECTS_DIR, path.relative(PROJECTS_DIR, file))
    let current = PROJECTS_DIR
    for (const part of path.relative(PROJECTS_DIR, file).split(path.sep)) {
      current = path.join(current, part)
      try { if (fs.lstatSync(current).isSymbolicLink()) throw new HttpError(400, 'Symbolic links are not supported in project files') }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    }
  } catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Invalid file path') }
  if (fs.existsSync(file)) {
    if (!fs.lstatSync(file).isFile()) throw new HttpError(400, 'Path must identify a regular file')
  } else if (mustExist) throw new HttpError(404, 'File not found')
  return file
}

function checkPayloadKeys(payload: Record<string, unknown>, keys: string[]) {
  if (Object.keys(payload).some(key => !keys.includes(key))) throw new HttpError(400, 'Unexpected request field')
}

const server = http.createServer((req, res) => {
  void handleRequest(req, res).catch((error: unknown) => {
    if (res.destroyed || res.writableEnded) return
    const status = error instanceof HttpError ? error.status : 500
    const message = error instanceof HttpError ? error.message : 'The backend could not complete this request. Retry or inspect the server log.'
    if (status >= 500) console.error('[server] Request failed:', error instanceof Error ? error.message : String(error))
    if (res.headersSent) {
      sseWrite(res, { type: 'error', message })
      sseWrite(res, { type: 'done', ok: false, status: error instanceof Error && error.name === 'AbortError' ? 'aborted' : 'failed', aborted: error instanceof Error && error.name === 'AbortError' })
      res.end()
    } else {
      if (status === 413 || status === 408) res.setHeader('Connection', 'close')
      respondJSON(res, status, { error: message })
    }
  })
})

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (!allowLocalRequest(req.headers, PORT, USE_VITE_DEV ? VITE_DEV_URL : undefined)) throw new HttpError(403, 'Forbidden origin or host')
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  if (req.headers.origin) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  }
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-OFS-Token')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  if (req.method === 'GET' && url.pathname === '/api/identity') {
    respondJSON(res, 200, { application: 'openfoam-studio', version: APP_VERSION, protocol: 1 })
    return
  }
  if (req.method === 'GET' && url.pathname === '/api/session') {
    setSessionCookie(res)
    respondJSON(res, 200, { token: SESSION_TOKEN })
    return
  }
  if (req.method === 'GET' && url.pathname === '/') {
    setSessionCookie(res)
    if (USE_VITE_DEV) proxyToVite(req, res)
    else serveRendererAsset('/', res)
    return
  }
  if (req.method === 'GET' && url.pathname === '/health') {
    respondJSON(res, 200, await runHealthChecks(docker))
    return
  }

  const protectedRoute = url.pathname === '/settings' || url.pathname.startsWith('/settings/')
    || url.pathname === '/api/settings' || url.pathname.startsWith('/api/settings/')
    || url.pathname === '/api/projects' || url.pathname.startsWith('/api/projects/')
    || url.pathname.startsWith('/health/')
  if (protectedRoute && !authorizedSession(req)) throw new HttpError(401, 'A local application session is required. Reload the app and retry.')

  if (req.method === 'POST' && url.pathname === '/health/fix') {
    checkPayloadKeys(parseObject(await readBody(req)), [])
    respondJSON(res, 200, await repairHealthChecks(docker))
    return
  }
  if (req.method === 'POST' && url.pathname === '/health/fix/stream') {
    checkPayloadKeys(parseObject(await readBody(req)), [])
    sseHeaders(res)
    const controller = new AbortController()
    const disconnected = () => { if (!res.writableEnded) controller.abort(new Error('Client disconnected')) }
    res.on('close', disconnected)
    try {
      const result = await repairHealthChecks(docker, {
        signal: controller.signal,
        runCommand: (id, onLine, options) => runAllowedHostCommand(id, line => {
          sseWrite(res, { type: 'line', commandId: id, line })
          onLine?.(line)
        }, options),
      })
      sseWrite(res, { type: 'done', result })
    } finally { res.off('close', disconnected); res.end() }
    return
  }

  const settingsPath = url.pathname.replace(/^\/api\/settings/, '/settings')
  if (req.method === 'GET' && settingsPath === '/settings') {
    await settingsWriteQueue
    const cfg = readConfig()
    const provider = getActiveProvider(cfg)
    const hasAuth = provider === 'codex-cli' ? await checkCodexAuthentication() : provider === 'claude-cli' ? await checkClaudeAuthentication() : hasLLMAuth(cfg)
    respondJSON(res, 200, {
      provider, model: getActiveModel(cfg), customBaseURL: cfg.customBaseURL ?? '', hasAuth,
      hasKeys: Object.fromEntries(['anthropic', 'openai', 'google', 'openai-compatible'].map(id => [id, !!getProviderKey(id as LLMProvider, cfg)])),
      providers: (Object.keys(PROVIDER_LABELS) as LLMProvider[]).map(id => ({ id, label: PROVIDER_LABELS[id], defaultModel: DEFAULT_MODEL[id], models: MODEL_OPTIONS[id] ?? [] })),
      hasApiKey: !!getProviderKey('anthropic', cfg),
    })
    return
  }
  if (req.method === 'POST' && settingsPath === '/settings/test') {
    checkPayloadKeys(parseObject(await readBody(req)), [])
    await settingsWriteQueue
    const controller = new AbortController()
    const disconnected = () => { if (!res.writableEnded) controller.abort(new Error('Client disconnected')) }
    res.on('close', disconnected)
    try { respondJSON(res, 200, await testProviderConnection(readConfig(), { signal: controller.signal })) }
    finally { res.off('close', disconnected) }
    return
  }
  if (req.method === 'POST' && (settingsPath === '/settings' || settingsPath === '/settings/api-key')) {
    const payload = parseObject(await readBody(req))
    checkPayloadKeys(payload, settingsPath === '/settings/api-key' ? ['apiKey'] : ['provider', 'model', 'apiKey', 'customBaseURL', 'removeApiKeys'])
    const requestedProvider = stringField(payload, 'provider', 40)
    const model = stringField(payload, 'model', 200)
    const apiKey = stringField(payload, 'apiKey', 4096)
    const customBaseURL = stringField(payload, 'customBaseURL', 2048)
    const validProviders = Object.keys(PROVIDER_LABELS) as LLMProvider[]
    if (requestedProvider !== undefined && !validProviders.includes(requestedProvider as LLMProvider)) throw new HttpError(400, 'Unknown provider')
    if (settingsPath === '/settings/api-key' && !apiKey?.trim().startsWith('sk-ant-')) throw new HttpError(400, 'API key must start with sk-ant-')
    const keyProviders = ['anthropic', 'openai', 'google', 'openai-compatible'] as const
    const remove = payload['removeApiKeys']
    if (remove !== undefined && (!Array.isArray(remove) || remove.length > 4 || remove.some(value => typeof value !== 'string' || !keyProviders.includes(value as typeof keyProviders[number])))) throw new HttpError(400, 'removeApiKeys must contain valid API providers')
    if (customBaseURL?.trim()) {
      let endpoint: URL
      try { endpoint = new URL(customBaseURL.trim()) } catch { throw new HttpError(400, 'Endpoint must be an absolute HTTP or HTTPS URL') }
      if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new HttpError(400, 'Endpoint must be HTTP or HTTPS without embedded credentials')
    }
    const result = await serializeSettings(async () => {
      const prev = readConfig()
      let next: AppConfig = { ...prev }
      if (requestedProvider) next.llmProvider = requestedProvider as LLMProvider
      if (settingsPath === '/settings/api-key') next.llmProvider = prev.llmProvider ?? 'anthropic'
      const effectiveProvider = getActiveProvider(next)
      if (model !== undefined || requestedProvider) next.llmModel = model?.trim() || DEFAULT_MODEL[effectiveProvider] || undefined
      if (customBaseURL !== undefined) next.customBaseURL = customBaseURL.trim() || undefined
      if (remove) next = removeProviderKeys(next, remove as Array<typeof keyProviders[number]>)
      const target = settingsPath === '/settings/api-key' ? 'anthropic' : effectiveProvider
      if (apiKey !== undefined && keyProviders.includes(target as typeof keyProviders[number])) {
        const key = apiKey.trim()
        if (key) {
          next.apiKeys = { ...next.apiKeys, [target]: key }
          next.removedApiKeys = next.removedApiKeys?.filter(provider => provider !== target)
          if (target === 'anthropic') next.anthropicApiKey = key
        } else next = removeProviderKeys(next, [target as typeof keyProviders[number]])
      }
      await writeConfig(next)
      if (apiKey?.trim() && target === 'anthropic') process.env['ANTHROPIC_API_KEY'] = apiKey.trim()
      const hasAuth = effectiveProvider === 'codex-cli' ? await checkCodexAuthentication() : effectiveProvider === 'claude-cli' ? await checkClaudeAuthentication() : hasLLMAuth(next)
      return { ok: true, hasAuth }
    })
    respondJSON(res, 200, result)
    return
  }

  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] !== 'api' || parts[1] !== 'projects') {
    if (url.pathname.startsWith('/api/') || settingsPath.startsWith('/settings') || url.pathname.startsWith('/health')) throw new HttpError(404, 'Route not found')
    if (req.method === 'GET') {
      if (USE_VITE_DEV) { proxyToVite(req, res); return }
      if (serveRendererAsset(url.pathname, res)) return
    }
    throw new HttpError(404, 'Not found')
  }
  if (parts.length === 2 && req.method === 'GET') { respondJSON(res, 200, listProjects()); return }
  if (parts.length === 2 && req.method === 'POST') {
    const payload = parseObject(await readBody(req))
    checkPayloadKeys(payload, ['name', 'prompt', 'starter'])
    const name = stringField(payload, 'name', 120)?.trim() || 'New Simulation'
    const prompt = stringField(payload, 'prompt')?.trim() ?? ''
    const starter = stringField(payload, 'starter', 40)
    if (starter !== undefined && starter !== 'cavity' && starter !== 'solved-cavity') throw new HttpError(400, 'Unknown starter')
    const id = randomUUID().slice(0, 8)
    const caseDir = projectCaseDir(id)
    const meta: ProjectMeta = { id, name, prompt, status: starter ? 'unvalidated' : 'idle', createdAt: new Date().toISOString(), messages: [], retryCount: 0 }
    try {
      if (starter) {
        copyCase(FIXTURE_DIR, caseDir, true)
        assertCaseExecutionPolicy(caseDir)
        meta.revision = caseRevision(caseDir)
        meta.validation = { ok: false, checkedAt: new Date().toISOString(), note: 'Bundled Re=100 laminar cavity inputs; mesh, solver, and benchmark validation have not been run for this project.' }
        if (starter === 'solved-cavity') {
          const reference = path.join(PROJECT_ROOT, 'demo', 'starters', 'solved-cavity')
          if (!fs.existsSync(reference)) throw new HttpError(503, 'The bundled reference example is unavailable')
          const runId = randomUUID()
          const archived = path.join(PROJECTS_DIR, id, 'runs', runId, 'case')
          copyCase(caseDir, archived)
          copyCase(reference, archived)
          meta.latestRunId = runId
          meta.example = true
          meta.validation.note = 'Bundled visualization reference data, not a solver or benchmark certification. Create the separate cavity starter to obtain measured results.'
          appendJsonl(projectRunsJsonl(id), { id: runId, startedAt: meta.createdAt, finishedAt: meta.createdAt, status: 'reference', exits: [], inputRevision: meta.revision,
            validation: { meshChecked: false, solverCompleted: false, finiteFields: false, benchmark: 'not-run', warnings: [meta.validation.note] },
          } satisfies RunRecord)
          atomicWrite(projectRunLogPath(id, runId), `${meta.validation.note}\nNo solver was executed for this reference example.\n`)
          meta.messages.push({ role: 'assistant', content: meta.validation.note, timestamp: meta.createdAt })
        }
      }
      writeMeta(id, meta)
    } catch (error) { fs.rmSync(path.join(PROJECTS_DIR, id), { recursive: true, force: true }); throw error }
    respondJSON(res, 201, meta)
    return
  }

  if (parts.length === 3 && parts[2] === 'import' && req.method === 'POST') {
    const archive = parseProjectArchive(parseObject(await readRequestBody(req, ARCHIVE_BODY_LIMIT)))
    const id = randomUUID().slice(0, 8)
    const importDir = path.join(PROJECTS_DIR, '.imports', randomUUID())
    const destination = path.join(PROJECTS_DIR, id)
    try {
      for (const file of archive.files) atomicWrite(requestCaseFile(importDir, file.path, false), file.content)
      const caseDir = path.join(importDir, 'case')
      for (const file of inputFiles(caseDir)) atomicWrite(file.path, normalizeLF(fs.readFileSync(file.path, 'utf8')))
      try {
        assertCaseExecutionPolicy(caseDir)
        for (const run of archive.runs) assertCaseExecutionPolicy(path.join(importDir, 'runs', run.id, 'case'))
      } catch (error) { throw new HttpError(422, error instanceof Error ? error.message : 'Imported case violates the execution policy') }
      const createdAt = new Date().toISOString()
      const imported: ProjectMeta = { ...archive.project, id, createdAt, revision: caseRevision(caseDir), retryCount: 0, status: 'unvalidated',
        validation: { ok: false, checkedAt: createdAt, note: 'Imported case. Validate mesh and solver locally before relying on results; archived runs retain their original validation records.' },
      }
      atomicWrite(path.join(importDir, 'meta.json'), JSON.stringify(imported, null, 2))
      atomicWrite(path.join(importDir, 'runs.jsonl'), archive.runs.map(record => JSON.stringify(record.status === 'running' ? { ...record, status: 'aborted', finishedAt: createdAt, errorMessage: 'Active run imported as interrupted' } : record)).join('\n') + '\n')
      atomicWrite(path.join(importDir, 'commands.jsonl'), archive.commands.map(record => JSON.stringify(record)).join('\n') + '\n')
      fs.renameSync(importDir, destination)
      respondJSON(res, 201, imported)
    } finally { fs.rmSync(importDir, { recursive: true, force: true }) }
    return
  }

  const projectId = parts[2]
  const action = parts[3]
  if (!projectId || !/^[a-zA-Z0-9-]{1,64}$/.test(projectId)) throw new HttpError(400, 'Invalid project ID')
  const projectDir = path.join(PROJECTS_DIR, projectId)
  if (fs.existsSync(projectDir) && fs.lstatSync(projectDir).isSymbolicLink()) throw new HttpError(400, 'Symbolic links are not supported in projects')
  requestCaseFile(projectDir, 'meta.json')
  const meta = readMeta(projectId)
  if (!meta) throw new HttpError(404, 'Project not found')
  if (!['GET', 'HEAD'].includes(req.method ?? '') && action !== 'stop') requireIdleProject(projectId)

  if (!action && parts.length === 3 && req.method === 'GET') { respondJSON(res, 200, meta); return }
  if (!action && parts.length === 3 && req.method === 'PATCH') {
    const payload = parseObject(await readBody(req))
    checkPayloadKeys(payload, ['name'])
    const name = stringField(payload, 'name', 120)?.trim()
    if (!name) throw new HttpError(400, 'Project name is required')
    requireIdleProject(projectId)
    const renamed = { ...readMeta(projectId)!, name }
    writeMeta(projectId, renamed)
    respondJSON(res, 200, renamed)
    return
  }
  if (!action && parts.length === 3 && req.method === 'DELETE') {
    const trashDir = path.join(PROJECTS_DIR, '.trash')
    fs.mkdirSync(trashDir, { recursive: true })
    fs.renameSync(projectDir, path.join(trashDir, `${projectId}-${Date.now()}-${randomUUID()}`))
    res.writeHead(204); res.end()
    return
  }
  if ((action === 'export' || action === 'support') && parts.length === 4 && req.method === 'GET') {
    requireIdleProject(projectId)
    const cfg = readConfig()
    const redact = createTextRedactor([SESSION_TOKEN, ...['anthropic', 'openai', 'google', 'openai-compatible'].map(provider => getProviderKey(provider as LLMProvider, cfg))])
    if (action === 'support') {
      const report = { format: 'openfoam-studio-support', version: 1, applicationVersion: APP_VERSION, exportedAt: new Date().toISOString(), project: meta,
        provider: getActiveProvider(cfg), model: getActiveModel(cfg), runs: readJsonl<RunRecord>(projectRunsJsonl(projectId)), commands: readJsonl<CommandRecord>(projectCommandsJsonl(projectId)),
        privacy: 'Includes project names, chat, and command records. Known credentials are redacted. Review before sharing.' }
      res.setHeader('Content-Disposition', `attachment; filename="openfoam-support-${projectId}.json"`)
      respondJSON(res, 200, redactObject(report, redact))
      return
    }
    const files = getAllFiles(projectDir)
    const total = files.reduce((size, file) => size + fs.statSync(file.path).size, 0)
    if (total > 128 * 1024 * 1024) throw new HttpError(413, 'Project exceeds the 128 MB JSON export limit. Copy the project folder to export larger runs.')
    const exported = { format: 'openfoam-studio-project', version: 1, exportedAt: new Date().toISOString(), applicationVersion: APP_VERSION,
      project: meta, runs: readJsonl<RunRecord>(projectRunsJsonl(projectId)), commands: readJsonl<CommandRecord>(projectCommandsJsonl(projectId)),
      case: Object.fromEntries(inputFiles(projectCaseDir(projectId)).map(file => [file.relPath, fs.readFileSync(file.path, 'utf8')])),
      files: files.map(file => {
        const original = fs.readFileSync(file.path)
        const text = original.toString('utf8')
        const content = !['.vtk', '.vtu', '.vtp', '.vtm'].includes(path.extname(file.path).toLowerCase()) && Buffer.from(text, 'utf8').equals(original) ? Buffer.from(redact(text), 'utf8') : original
        return { path: file.relPath, encoding: 'base64', content: content.toString('base64') }
      }),
    }
    res.setHeader('Content-Disposition', `attachment; filename="openfoam-project-${projectId}.json"`)
    const shareable = { ...redactObject({ ...exported, files: [] }, redact), files: exported.files }
    if (Buffer.byteLength(JSON.stringify(shareable)) > ARCHIVE_BODY_LIMIT) throw new HttpError(413, 'The encoded project exceeds the 192 MB import/export limit. Copy the project folder to export larger runs.')
    respondJSON(res, 200, shareable)
    return
  }
  if (action === 'files' && parts.length === 4 && req.method === 'GET') {
    respondJSON(res, 200, getAllFiles(projectCaseDir(projectId)).map(file => ({ relPath: file.relPath })))
    return
  }
  if (action === 'file' && parts.length === 4 && req.method === 'GET') {
    const file = requestCaseFile(projectCaseDir(projectId), url.searchParams.get('path') ?? '')
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(fs.readFileSync(file, 'utf8'))
    return
  }
  if (action === 'file' && parts.length === 4 && req.method === 'PUT') {
    const relative = url.searchParams.get('path') ?? ''
    const caseDir = projectCaseDir(projectId)
    const file = requestCaseFile(caseDir, relative, false)
    const canonical = path.relative(caseDir, file).split(path.sep).join('/')
    if (!/^(?:0|constant|system)\//.test(canonical) || canonical.startsWith('constant/polyMesh/')) throw new HttpError(400, 'Only case input files can be edited')
    const payload = parseObject(await readBody(req))
    checkPayloadKeys(payload, ['content', 'expectedContent'])
    const content = stringField(payload, 'content', 1024 * 1024)
    const expected = stringField(payload, 'expectedContent', 1024 * 1024)
    if (content === undefined) throw new HttpError(400, 'content is required')
    requireIdleProject(projectId)
    requestCaseFile(caseDir, relative, false)
    if (fs.existsSync(file)) {
      if (expected === undefined) throw new HttpError(428, 'expectedContent is required when saving an existing file')
      if (fs.readFileSync(file, 'utf8') !== expected) throw new HttpError(409, 'The file changed since it was opened. Reload and reconcile your edits.')
    } else if (expected !== undefined && expected !== '') throw new HttpError(409, 'The original file no longer exists')
    const normalized = normalizeLF(content)
    try { assertSafeDictionary(normalized, canonical) } catch (error) { throw new HttpError(422, error instanceof Error ? error.message : 'Unsafe case dictionary') }
    const current = readMeta(projectId)
    if (!current) throw new HttpError(409, 'Project metadata changed during save. Reload and retry.')
    const original = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
    atomicWrite(file, normalized)
    let revision: string
    try {
      revision = caseRevision(caseDir)
      writeMeta(projectId, { ...current, status: 'unvalidated', revision, validation: { ok: false, note: 'Inputs changed. Run mesh and solver validation before relying on results.', checkedAt: new Date().toISOString() } })
    } catch (error) {
      try { if (original === null) fs.rmSync(file); else atomicWrite(file, original) }
      catch (rollback) { throw new HttpError(500, `Save failed and rollback could not restore ${canonical}. Inspect the case before running. ${rollback instanceof Error ? rollback.message : ''}`) }
      throw error
    }
    respondJSON(res, 200, { ok: true, revision })
    return
  }
  if (action === 'vtk' && parts.length === 5 && parts[4] === 'manifest' && req.method === 'GET') {
    const requestedRun = url.searchParams.get('runId')
    const run = selectedRun(projectId, requestedRun)
    const vtkDir = path.join(resultsCaseDir(projectId, requestedRun), 'VTK')
    const entries = getAllFiles(vtkDir).filter(file => ['.vtu', '.vtp', '.vtm', '.vtk'].includes(path.extname(file.relPath).toLowerCase())).map(file => {
      const info = classifyVtkFile(file.relPath)
      return { relPath: file.relPath, size: fs.statSync(file.path).size, ext: path.extname(file.relPath).toLowerCase(), time: info.time, kind: info.kind, patchName: info.patchName }
    }).sort((a, b) => (a.time ?? -1) - (b.time ?? -1) || a.relPath.localeCompare(b.relPath))
    const currentRevision = caseRevision(projectCaseDir(projectId))
    respondJSON(res, 200, { files: entries, series: buildVtkSeries(entries.map(entry => entry.relPath)), runId: run?.id ?? null,
      inputRevision: run?.inputRevision ?? null, currentRevision, stale: !!run && run.inputRevision !== currentRevision, validation: run?.validation ?? null,
    })
    return
  }
  if (action === 'vtk' && parts.length === 5 && parts[4] === 'file' && req.method === 'GET') {
    const vtkDir = path.join(resultsCaseDir(projectId, url.searchParams.get('runId')), 'VTK')
    const file = requestCaseFile(vtkDir, url.searchParams.get('path') ?? '')
    if (!['.vtu', '.vtp', '.vtm', '.vtk'].includes(path.extname(file).toLowerCase())) throw new HttpError(400, 'Unsupported VTK file')
    const stream = fs.createReadStream(file)
    stream.on('error', error => { console.error('[server] Result stream failed:', error.message); res.destroy(error) })
    res.on('close', () => stream.destroy())
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' })
    stream.pipe(res)
    return
  }
  if (action === 'runs' && parts.length === 4 && req.method === 'GET') {
    respondJSON(res, 200, readJsonl<RunRecord>(projectRunsJsonl(projectId)).sort((a, b) => b.startedAt.localeCompare(a.startedAt)))
    return
  }
  if (action === 'runs' && parts.length === 6 && parts[5] === 'log' && req.method === 'GET') {
    const runId = parts[4]!
    if (!/^[a-zA-Z0-9-]{1,64}$/.test(runId)) throw new HttpError(400, 'Invalid run ID')
    const file = requestCaseFile(projectRunsLogDir(projectId), `${runId}.log`)
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(fs.readFileSync(file, 'utf8'))
    return
  }
  if (action === 'commands' && parts.length === 4 && req.method === 'GET') {
    const rawLimit = url.searchParams.get('limit') ?? '200'
    if (!/^\d+$/.test(rawLimit)) throw new HttpError(400, 'limit must be a positive integer')
    const limit = Math.min(Number(rawLimit), 1000)
    if (limit < 1) throw new HttpError(400, 'limit must be positive')
    respondJSON(res, 200, readJsonl<CommandRecord>(projectCommandsJsonl(projectId)).sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, limit))
    return
  }
  if (action === 'messages' && parts.length === 4 && req.method === 'DELETE') {
    writeMeta(projectId, { ...meta, messages: [] })
    res.writeHead(204); res.end()
    return
  }
  if (action === 'stop' && parts.length === 4 && req.method === 'POST') {
    activeJobs.get(projectId)?.abort(new Error('Stopped by user'))
    respondJSON(res, 200, { ok: true })
    return
  }
  if (action === 'generate' && parts.length === 4 && req.method === 'POST') {
    await withProjectJob(projectId, res, signal => handleGenerate(projectId, req, res, signal))
    return
  }
  if (action === 'run' && parts.length === 4 && req.method === 'POST') {
    await withProjectJob(projectId, res, async signal => {
      checkPayloadKeys(parseObject(await readBody(req)), [])
      writeMeta(projectId, { ...readMeta(projectId)!, retryCount: 0 })
      await handleRun(projectId, req, res, signal)
    })
    return
  }
  if (action === 'postprocess' && parts.length === 4 && req.method === 'POST') {
    await withProjectJob(projectId, res, signal => handlePostprocess(projectId, req, res, signal))
    return
  }
  if (action === 'apply-fix' && parts.length === 4 && req.method === 'POST') {
    await withProjectJob(projectId, res, async signal => {
      const payload = parseObject(await readBody(req))
      checkPayloadKeys(payload, ['fix'])
      if (!Array.isArray(payload['fix']) || payload['fix'].length < 1 || payload['fix'].length > 50) throw new HttpError(400, 'fix must contain 1–50 valid patches')
      const fixes: FileFix[] = payload['fix'].map(value => {
        const parsed = FileFixSchema.safeParse(value)
        if (!parsed.success) throw new HttpError(400, 'Invalid patch schema')
        return parsed.data
      })
      const current = readMeta(projectId)!
      if ((current.retryCount ?? 0) >= 3) throw new HttpError(400, 'Max retries reached')
      const caseDir = projectCaseDir(projectId)
      const transactionId = randomUUID()
      const transactionDir = path.join(projectDir, 'jobs', transactionId)
      const staged = path.join(transactionDir, 'case')
      try {
        copyCase(caseDir, staged, true)
        for (const fix of fixes) {
          const original = requestCaseFile(caseDir, fix.file, false)
          if (fs.existsSync(original) && fix.expectedContent === undefined) throw new HttpError(428, `Patch requires expectedContent: ${fix.file}`)
        }
        const result = applyFixes(staged, fixes)
        if (!result.ok) throw new HttpError(result.status, result.message)
        try { assertCaseExecutionPolicy(staged) } catch (error) { throw new HttpError(422, error instanceof Error ? error.message : 'Recovery violates the execution policy') }
        signal.throwIfAborted()
        const backup = path.join(projectDir, 'revisions', transactionId, 'case')
        commitCaseInputs(caseDir, staged, backup)
        const message: Message = { role: 'assistant', timestamp: new Date().toISOString(), content: `Applied fix (attempt ${(current.retryCount ?? 0) + 1}):\n${fixes.map(fix => `• ${fix.file}: ${fix.description}`).join('\n')}\n\nRe-running simulation...` }
        try { writeMeta(projectId, { ...current, status: 'unvalidated', revision: caseRevision(caseDir), validation: { ok: false, checkedAt: message.timestamp, note: 'Recovery changed case inputs. Validation is pending.' }, retryCount: (current.retryCount ?? 0) + 1, messages: [...current.messages, message] }) }
        catch (error) {
          // A failed metadata commit must not leave a patch hidden behind old readiness.
          const rejected = path.join(projectDir, 'revisions', transactionId, 'rejected-case')
          try { fs.renameSync(caseDir, rejected); fs.renameSync(backup, caseDir) }
          catch (rollback) { throw new HttpError(500, `Recovery metadata failed and rollback could not restore the case. Inspect the revision backup before running. ${rollback instanceof Error ? rollback.message : ''}`) }
          throw error
        }
      } finally { fs.rmSync(transactionDir, { recursive: true, force: true }) }
      await handleRun(projectId, req, res, signal)
    })
    return
  }
  throw new HttpError(404, 'Route not found')
}

let shuttingDown = false
async function shutdownBackend(exitCode = 0): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  for (const controller of activeJobs.values()) controller.abort(new Error('Application is shutting down'))
  const deadline = new Promise<void>(resolve => setTimeout(resolve, 3_500))
  const close = new Promise<void>(resolve => {
    server.close(() => resolve())
    server.closeIdleConnections()
  })
  const settleJobs = (async () => {
    while (activeJobs.size) await new Promise(resolve => setTimeout(resolve, 25))
  })()
  await Promise.race([Promise.allSettled([close, settleJobs, cleanupOwnedContainers()]), deadline])
  server.closeAllConnections()
  try { reconcileInterruptedProjects(PROJECTS_DIR) }
  catch (error) { console.error('[server] Could not reconcile interrupted metadata:', error instanceof Error ? error.message : String(error)); exitCode = 1 }
  process.exit(exitCode)
}

process.once('SIGINT', () => { void shutdownBackend() })
process.once('SIGTERM', () => { void shutdownBackend() })

server.on('error', (err: NodeJS.ErrnoException) => {
  console.error(err.code === 'EADDRINUSE'
    ? `[server] Port ${PORT} is occupied. Close the other application/server and retry.`
    : `[server] Unable to listen: ${err.message}`)
  void shutdownBackend(1)
})

// Bind loopback only. A public listener would expose local case and Docker controls.
const HOST = process.env['OFS_HOST'] ?? '127.0.0.1'
if (!['127.0.0.1', 'localhost', '::1'].includes(HOST)) throw new Error('OFS_HOST must be a loopback address')
const reconciled = reconcileInterruptedProjects(PROJECTS_DIR)
if (reconciled.projects || reconciled.runs) console.log(`[server] Reconciled ${reconciled.projects} interrupted projects and ${reconciled.runs} aborted runs.`)
server.listen(PORT, HOST, () => {
  console.log(`OpenFOAM Studio server listening on http://${HOST}:${PORT}`)
})
