import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import Docker from 'dockerode'
import { FileGenerator } from '../core/agent/FileGenerator.js'
import { runAgentLoop } from '../core/agent/AgentLoop.js'
import { runClaudeAgent } from '../core/agent/ClaudeAgentRunner.js'
import { repairHealthChecks, runHealthChecks } from '../core/health.js'
import { runDockerCommand } from '../core/docker/CommandRunner.js'
import { classifyVtkFile, buildVtkSeries } from '../core/postprocess/vtkSeries.js'
import {
  loadApiKeyIntoEnv,
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
import { applyFixes } from '../core/agent/applyFix.js'
import { buildRunCommands, VTK_EXPORT_FIELDS } from '../core/run/buildRunCommands.js'
import { generateWithLLM } from '../core/agent/llm.js'
import { withCappedEndTime } from '../core/agent/tools.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.join(__dirname, '..')
// In the packaged Electron app, OFS_CONFIG_DIR is set to app.getPath('userData')
// so projects survive updates and are never stored inside the read-only app bundle.
const PROJECTS_DIR = process.env.OFS_CONFIG_DIR
  ? path.join(process.env.OFS_CONFIG_DIR, 'projects')
  : path.join(__dirname, 'projects')
const FIXTURE_DIR = path.join(PROJECT_ROOT, 'tests/fixtures/generated/cavity')
const RENDERER_DIST = path.join(PROJECT_ROOT, 'renderer', 'dist')
const VITE_DEV_URL = process.env.OFS_VITE_URL ?? 'http://localhost:5173'
const USE_VITE_DEV = process.env.OFS_DEV === '1'
const PORT = Number(process.env.OFS_PORT) || 3456

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
const fileGen = new FileGenerator()

// Load persisted ANTHROPIC_API_KEY (from user-facing settings) into process.env
// so child claude-cli invocations inherit it.
loadApiKeyIntoEnv()

// ── Project helpers ───────────────────────────────────────────────────────────

interface ProjectMeta {
  id: string
  name: string
  prompt: string
  status: 'idle' | 'generating' | 'running' | 'ready' | 'done' | 'error'
  createdAt: string
  messages: Message[]
  retryCount: number
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
  status: 'running' | 'success' | 'failed' | 'aborted' | 'exhausted'
  exits: { cmd: string; code: number }[]
  errorMessage?: string
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
  fs.writeFileSync(file, records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8')
}

function readMeta(id: string): ProjectMeta | null {
  try { return JSON.parse(fs.readFileSync(projectMetaPath(id), 'utf8')) } catch { return null }
}

function writeMeta(id: string, meta: ProjectMeta) {
  fs.mkdirSync(path.dirname(projectMetaPath(id)), { recursive: true })
  fs.writeFileSync(projectMetaPath(id), JSON.stringify(meta, null, 2))
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

function getAllFiles(dir: string, base = dir): { path: string; relPath: string }[] {
  if (!fs.existsSync(dir)) return []
  const results: { path: string; relPath: string }[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) results.push(...getAllFiles(full, base))
    else results.push({ path: full, relPath: path.relative(base, full).replace(/\\/g, '/') })
  }
  return results
}

// ── SSE helpers ───────────────────────────────────────────────────────────────

function sseHeaders(res: http.ServerResponse) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })
}

function sseWrite(res: http.ServerResponse, data: object) {
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise(resolve => {
    let body = ''
    req.on('data', c => { body += c.toString() })
    req.on('end', () => resolve(body))
  })
}

// ── Request handlers ──────────────────────────────────────────────────────────

async function handleGenerate(projectId: string, req: http.IncomingMessage, res: http.ServerResponse) {
  const body = await readBody(req)
  let prompt = ''
  try {
    const parsed = JSON.parse(body)
    prompt = (parsed?.prompt ?? '').trim()
  } catch { /* no body */ }

  const meta = readMeta(projectId)
  if (!meta) { res.writeHead(404); res.end('Project not found'); return }

  sseHeaders(res)

  // Update name from prompt (first 60 chars), status → generating
  if (prompt) {
    const userMessage: Message = {
      role: 'user',
      content: prompt,
      timestamp: new Date().toISOString(),
    }
    writeMeta(projectId, {
      ...meta,
      name: prompt.length > 60 ? prompt.slice(0, 57) + '…' : prompt,
      prompt,
      status: 'generating',
      messages: [...(meta.messages ?? []), userMessage],
    })
  }

  let files: Record<string, string>
  let agentSummary: string | null = null
  const caseDir = projectCaseDir(projectId)
  // Refinement = a conversation already exists on disk. Case continuity and
  // agent history are derived server-side from meta, not from the client
  // payload (the client only ever sends { prompt }).
  const priorMessages: Message[] = meta.messages ?? []
  const isRefinement = priorMessages.length > 0
  const activeProvider = getActiveProvider()

  // Stop the agent (and its token spend) when the client disconnects or hits Stop.
  const abortCtrl = new AbortController()
  const onClientClose = () => abortCtrl.abort()
  req.on('close', onClientClose)
  // Paths the agent actually wrote this turn — refinement turns must not
  // report the whole case directory as changed.
  const writtenPaths = new Set<string>()
  // Compact tool-call trail, persisted with the assistant message so the
  // activity block survives after the response and across reloads.
  const stepTrail: import('../core/agent/types.js').PersistedAgentStep[] = []
  const stepByCallId = new Map<string, (typeof stepTrail)[number]>()
  const summarizeToolArgs = (args: unknown): string | undefined => {
    if (!args || typeof args !== 'object') return undefined
    const a = args as Record<string, unknown>
    for (const k of ['path', 'query', 'cmd']) {
      if (typeof a[k] === 'string' && a[k]) return a[k] as string
    }
    return undefined
  }

  if (!prompt) {
    sseWrite(res, { type: 'status', message: 'Loading validated cavity case files…' })
    files = {}
    for (const f of getAllFiles(FIXTURE_DIR)) {
      files[f.relPath] = fs.readFileSync(f.path, 'utf8')
    }
    if (!isRefinement) fs.rmSync(caseDir, { recursive: true, force: true })
    for (const [relPath, content] of Object.entries(files)) {
      const full = path.join(caseDir, relPath)
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, content.replace(/\r\n/g, '\n'), 'utf8')
    }
  } else {
    // Agent loop path. Two engines depending on provider:
    //   - claude-cli  : spawn `claude --print --output-format stream-json` and
    //                   inherit Claude Code's native multi-turn loop with
    //                   Read/Write/Edit tools (no Docker validation).
    //   - everything  : Vercel AI SDK tool-calling loop with full doc search +
    //                   blockMesh/checkMesh/foamRun smoke-test.
    sseWrite(res, { type: 'status', message: 'Agent: planning your OpenFOAM case…' })
    if (!isRefinement) fs.rmSync(caseDir, { recursive: true, force: true })
    fs.mkdirSync(caseDir, { recursive: true })

    const onAgentEvent = (e: import('../core/agent/tools.js').AgentEvent) => {
      // Track writes but don't forward per-tool `file` notifications. The
      // post-loop summary stream below emits authoritative `file` events with
      // full content; the live tool-call block already shows progress.
      if (e.type === 'file') {
        writtenPaths.add(e.path)
        return
      }
      if (e.type === 'tool-call') {
        const summary = summarizeToolArgs(e.args)
        const step: (typeof stepTrail)[number] = { tool: e.tool, ok: false, ...(summary ? { summary } : {}) }
        stepByCallId.set(e.id, step)
        stepTrail.push(step)
      } else if (e.type === 'tool-result') {
        const step = stepByCallId.get(e.id)
        if (step) {
          step.ok = e.ok
          step.durationMs = e.durationMs
        }
      }
      sseWrite(res, e)
    }

    try {
      if (activeProvider === 'claude-cli') {
        const result = await runClaudeAgent({
          caseDir,
          prompt,
          history: priorMessages,
          onEvent: onAgentEvent,
          signal: abortCtrl.signal,
        })
        agentSummary = result.finishSummary ?? result.finalText ?? null
      } else if (activeProvider === 'openai-compatible') {
        // Local LLMs (LM Studio, Ollama) can't produce all 8 files in one JSON
        // blob without truncating. Generate each file in a separate LLM call.
        sseWrite(res, { type: 'status', message: 'Generating case files with local model…' })
        const caseFiles = await fileGen.generateFileByFile(
          prompt,
          (msg) => sseWrite(res, { type: 'status', message: msg }),
          abortCtrl.signal,
        )
        for (const [relPath, content] of Object.entries(caseFiles)) {
          const full = path.join(caseDir, relPath)
          fs.mkdirSync(path.dirname(full), { recursive: true })
          fs.writeFileSync(full, content.replace(/\r\n/g, '\n'), 'utf8')
          writtenPaths.add(relPath)
        }
        agentSummary = `Generated ${Object.keys(caseFiles).length} case file(s) with local model.`
      } else {
        const result = await runAgentLoop({
          caseDir,
          prompt,
          history: priorMessages,
          docker,
          onEvent: onAgentEvent,
          signal: abortCtrl.signal,
        })
        agentSummary = result.finishSummary ?? result.finalText ?? null
      }
    } catch (err: unknown) {
      req.off('close', onClientClose)
      if (abortCtrl.signal.aborted) {
        // Client cancelled — the meta the user sees next should not scream
        // error; whatever files landed on disk are still usable.
        writeMeta(projectId, { ...readMeta(projectId)!, status: isRefinement ? 'ready' : 'idle' })
        res.end()
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      writeMeta(projectId, { ...readMeta(projectId)!, status: 'error' })
      sseWrite(res, { type: 'error', message })
      res.end()
      return
    }

    // The agent's own writes are authoritative for "what changed this turn".
    // A refinement turn that touched one file reports one file, and a pure
    // Q&A turn (agent answered without editing anything) reports none.
    files = {}
    for (const relPath of writtenPaths) {
      const full = path.join(caseDir, relPath)
      if (fs.existsSync(full)) files[relPath] = fs.readFileSync(full, 'utf8')
    }
    // Claude CLI runs don't reliably emit file events — fall back to a full
    // case scan on non-refinement turns, where everything on disk is new.
    if (Object.keys(files).length === 0 && !isRefinement) {
      for (const f of getAllFiles(caseDir)) {
        files[f.relPath] = fs.readFileSync(f.path, 'utf8')
      }
    }
    if (Object.keys(files).length === 0 && !(agentSummary && agentSummary.trim())) {
      const message = 'Agent finished without writing any case files. Try again, or check the provider/API error details above.'
      writeMeta(projectId, { ...readMeta(projectId)!, status: 'error' })
      sseWrite(res, { type: 'error', message })
      res.end()
      return
    }

    // The AI-SDK loop already validated in-loop; claude-cli and local models
    // could not. Validate here so the user's first Run doesn't hit the first
    // FOAM FATAL ERROR that the model never saw.
    const engineValidatesInLoop = activeProvider !== 'claude-cli' && activeProvider !== 'openai-compatible'
    if (!engineValidatesInLoop && Object.keys(files).length > 0 && !abortCtrl.signal.aborted) {
      sseWrite(res, { type: 'status', message: 'Validating the case with blockMesh + a short foamRun…' })
      const validation = await validateGeneratedCase(caseDir, onAgentEvent, abortCtrl.signal)
      if (validation) {
        for (const rel of validation.fixedFiles) {
          const full = path.join(caseDir, rel)
          if (fs.existsSync(full)) {
            files[rel] = fs.readFileSync(full, 'utf8')
            writtenPaths.add(rel)
          }
        }
        agentSummary = agentSummary?.trim()
          ? `${agentSummary.trim()}\n\n${validation.note}`
          : validation.note
      }
    }
  }
  req.off('close', onClientClose)

  const filesChanged = Object.keys(files)
  // The file list lives in `filesChanged` (rendered as clickable chips by the
  // UI) — don't duplicate it into the message text.
  const assistantContent = agentSummary?.trim()
    || (filesChanged.length > 0
      ? `Updated ${filesChanged.length} file${filesChanged.length === 1 ? '' : 's'}.`
      : 'No files needed to change.')
  const assistantMessage: Message = {
    role: 'assistant',
    content: assistantContent,
    timestamp: new Date().toISOString(),
    filesChanged,
    ...(stepTrail.length > 0 ? { agentSteps: stepTrail } : {}),
  }
  const currentMeta = readMeta(projectId)!
  writeMeta(projectId, {
    ...currentMeta,
    status: 'ready',
    messages: [...(currentMeta.messages ?? []), assistantMessage],
  })

  // Stream files in case-logical order. The short delay keeps the UI cascade
  // readable without meaningfully slowing the turn down.
  const ORDER = [
    'system/controlDict', 'constant/physicalProperties', 'constant/momentumTransport',
    'system/blockMeshDict', 'system/fvSchemes', 'system/fvSolution', '0/U', '0/p',
  ]
  const sorted = Object.entries(files).sort(([a], [b]) => {
    const ai = ORDER.indexOf(a), bi = ORDER.indexOf(b)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })

  for (const [relPath, content] of sorted) {
    sseWrite(res, { type: 'file', path: relPath, content })
    await sleep(60)
  }

  sseWrite(res, { type: 'finish-summary', summary: assistantContent })
  sseWrite(res, { type: 'done' })
  res.end()
}

async function handleRun(projectId: string, req: http.IncomingMessage, res: http.ServerResponse) {
  const meta = readMeta(projectId)
  if (!meta) { res.writeHead(404); res.end('Project not found'); return }

  const caseDir = projectCaseDir(projectId)
  sseHeaders(res)

  if (!fs.existsSync(caseDir)) {
    sseWrite(res, { type: 'error', message: 'No case files found. Run Generate first.' })
    sseWrite(res, { type: 'done' })
    res.end()
    return
  }

  // Reset retryCount on every user-initiated run
  writeMeta(projectId, { ...meta, status: 'running', retryCount: meta.retryCount ?? 0 })

  // ── Run record + log capture ──────────────────────────────────────────────
  const runId = randomUUID().slice(0, 8)
  const runRecord: RunRecord = {
    id: runId,
    startedAt: new Date().toISOString(),
    status: 'running',
    exits: [],
  }
  appendJsonl(projectRunsJsonl(projectId), runRecord)
  fs.mkdirSync(projectRunsLogDir(projectId), { recursive: true })
  const runLogStream = fs.createWriteStream(projectRunLogPath(projectId, runId), { flags: 'w' })
  const writeRunLog = (line: string) => { runLogStream.write(line + '\n') }

  let clientAborted = false
  const runAbort = new AbortController()
  const onClose = () => {
    clientAborted = true
    runAbort.abort()
  }
  req.on('close', onClose)

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
      errorMessage,
    })
    runLogStream.end()
  }

  sseWrite(res, { type: 'run-started', runId })

  // Pipeline: blockMesh → [setFields if VoF] → foamToVTK(mesh) → foamRun → foamToVTK(all)
  const commands = buildRunCommands(caseDir)

  let solverOk = false
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

  for (const { cmd, args } of commands) {
    // Stop button / closed window: don't start the next pipeline stage.
    if (clientAborted) break
    const header = `\n> ${cmd} ${args.join(' ')}`
    sseWrite(res, { type: 'log', line: header })
    writeRunLog(header)
    const cmdStart = Date.now()
    try {
      const exitCode = await runDockerCommand(docker, {
        command: cmd,
        args,
        caseDir,
        signal: runAbort.signal,
        onLine: line => {
          lastLogTime = Date.now()
          if (cmd === 'foamRun') {
            logBuffer.push(line)
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
            const diagnosis = diagnose(fullLog)
            if (diagnosis) {
              sseWrite(res, { type: 'diagnosis', result: diagnosis })
            } else {
              const askLine = '\n[Asking Claude to diagnose the error...]'
              sseWrite(res, { type: 'log', line: askLine })
              writeRunLog(askLine)
              const aiDiagnosis = await claudeDiagnose(logBuffer.slice(-60).join('\n'), caseDir)
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
        const diverged = findDivergedField(caseDir)
        if (diverged) {
          const currentMeta = readMeta(projectId)!
          writeMeta(projectId, { ...currentMeta, status: 'error' })
          runErrorMessage = `Solution diverged: ${diverged.field} is nan at t=${diverged.time} (foamRun exited 0 but the numbers are dead)`
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
              `SOLUTION DIVERGED (no FATAL ERROR): field ${diverged.field} contains nan at time ${diverged.time}. ` +
              `Typical causes: time step too large for the physics (reduce maxDeltaT / add maxAlphaCo), ` +
              `missing or wrong pressure reference, bad initial conditions, or unbounded interface compression.`
            const askLine = '\n[Asking the model to diagnose the divergence...]'
            sseWrite(res, { type: 'log', line: askLine })
            writeRunLog(askLine)
            const aiDiagnosis = await claudeDiagnose(
              `${logBuffer.slice(-50).join('\n')}\n\n${divergenceNote}`,
              caseDir,
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

  clearInterval(dockerHeartbeat)
  req.off('close', onClose)

  if (solverOk) writeMeta(projectId, { ...readMeta(projectId)!, status: 'done' })
  // Aborted runs are not failures — the case files are still intact.
  else if (clientAborted) writeMeta(projectId, { ...readMeta(projectId)!, status: 'ready' })

  const finalStatus: RunRecord['status'] = clientAborted
    ? 'aborted'
    : solverOk
      ? 'success'
      : exhausted
        ? 'exhausted'
        : 'failed'
  finalizeRun(finalStatus, exitsCollected, runErrorMessage)

  sseWrite(res, { type: 'done' })
  res.end()
}

// POST /api/projects/<id>/postprocess → SSE re-run of foamToVTK on a solved
// case (e.g. projects solved before the Results tab existed, or to convert a
// different field set). Body: { fields?: string[] } — omit for the default set.
async function handlePostprocess(projectId: string, req: http.IncomingMessage, res: http.ServerResponse) {
  const meta = readMeta(projectId)
  if (!meta) { res.writeHead(404); res.end('Project not found'); return }
  const caseDir = projectCaseDir(projectId)
  if (!fs.existsSync(caseDir)) { res.writeHead(400); res.end('No case files'); return }

  const body = await readBody(req)
  let fields: string[] | null = null
  try {
    const parsed = body ? JSON.parse(body) : {}
    if (Array.isArray(parsed?.fields)) fields = parsed.fields
  } catch { /* default field set */ }
  if (fields && !fields.every((f) => typeof f === 'string' && /^[A-Za-z0-9_.:]+$/.test(f))) {
    res.writeHead(400); res.end('Invalid field names'); return
  }

  sseHeaders(res)
  const fieldArg = fields ? `(${fields.join(' ')})` : VTK_EXPORT_FIELDS
  const args = ['-case', '/cavity', '-ascii', '-useTimeName', '-fields', fieldArg]
  sseWrite(res, { type: 'log', line: `\n> foamToVTK ${args.join(' ')}` })
  const cmdStart = Date.now()
  try {
    const exitCode = await runDockerCommand(docker, {
      command: 'foamToVTK',
      args,
      caseDir,
      onLine: (line) => sseWrite(res, { type: 'log', line }),
    })
    sseWrite(res, { type: 'exit', cmd: 'foamToVTK', code: exitCode })
    appendJsonl(projectCommandsJsonl(projectId), {
      runId: `post-${randomUUID().slice(0, 8)}`,
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
  sseWrite(res, { type: 'done' })
  res.end()
}

// ── Post-generation validation ────────────────────────────────────────────────
// The AI-SDK agent loop validates with Docker in-loop, but the claude-cli and
// openai-compatible engines can't run commands while generating. Historically
// those cases hit their first FOAM FATAL ERROR at the Run button. This loop
// runs blockMesh → [setFields] → short foamRun right after generation and
// feeds fatals back through the existing diagnosis + applyFixes machinery.

const VALIDATION_MAX_FIX_ROUNDS = 2

interface ValidationOutcome {
  ok: boolean
  note: string
  fixedFiles: string[]
}

/**
 * Detect a silently diverged solve: OpenFOAM can march to endTime writing
 * `nan` everywhere and still exit 0. Scan the latest written time dir for nan
 * so the app reports an honest failure instead of a dead "success".
 */
function findDivergedField(caseDir: string): { field: string; time: string } | null {
  const dirs = [...listTimeDirs(caseDir)]
  if (dirs.length === 0) return null
  const latest = dirs.sort((a, b) => parseFloat(a) - parseFloat(b)).pop()!
  const dirPath = path.join(caseDir, latest)
  for (const name of fs.readdirSync(dirPath)) {
    const full = path.join(dirPath, name)
    if (!fs.statSync(full).isFile()) continue
    try {
      // Fields are ASCII; nan appears early when present. Cap the read.
      const fd = fs.openSync(full, 'r')
      const buf = Buffer.alloc(256 * 1024)
      const bytes = fs.readSync(fd, buf, 0, buf.length, 0)
      fs.closeSync(fd)
      if (/(?:^|[\s(])nan(?:[\s)]|$)/.test(buf.toString('utf8', 0, bytes))) {
        return { field: name, time: latest }
      }
    } catch { /* unreadable — skip */ }
  }
  return null
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
): Promise<ValidationOutcome | null> {
  const preexistingTimeDirs = listTimeDirs(caseDir)
  try {
    return await runValidationRounds(caseDir, onEvent, signal)
  } finally {
    // The smoke run must be side-effect free: partial time dirs left behind
    // make the real Run resume mid-way and can poison foamToVTK (e.g. nan p
    // fields written by a truncated VoF step).
    for (const dir of listTimeDirs(caseDir)) {
      if (!preexistingTimeDirs.has(dir)) {
        fs.rmSync(path.join(caseDir, dir), { recursive: true, force: true })
      }
    }
  }
}

async function runValidationRounds(
  caseDir: string,
  onEvent: (e: import('../core/agent/tools.js').AgentEvent) => void,
  signal: AbortSignal,
): Promise<ValidationOutcome | null> {
  const fixedFiles: string[] = []
  const appliedFixDescriptions: string[] = []

  for (let round = 0; round <= VALIDATION_MAX_FIX_ROUNDS; round++) {
    if (signal.aborted) return null
    const pipeline: string[] = [
      'blockMesh',
      ...(fs.existsSync(path.join(caseDir, 'system', 'setFieldsDict')) ? ['setFields'] : []),
      'foamRun',
    ]

    let fatalLog: string | null = null
    let fatalCmd = ''
    for (const cmd of pipeline) {
      if (signal.aborted) return null
      const callId = `validate_${cmd}_${round}`
      onEvent({ type: 'tool-call', id: callId, tool: 'run_command', args: { cmd } })
      const lines: string[] = []
      const started = Date.now()
      let exitCode: number
      try {
        let lastSent = 0
        const runIt = () =>
          runDockerCommand(docker, {
            command: cmd,
            args: [],
            caseDir,
            signal,
            onLine: (line) => {
              lines.push(line)
              const now = Date.now()
              if (now - lastSent >= 150) {
                onEvent({ type: 'tool-progress', id: callId, line })
                lastSent = now
              }
            },
          })
        // foamRun has no -endTime flag — cap via a temporary controlDict edit.
        exitCode = cmd === 'foamRun' ? await withCappedEndTime(caseDir, 20, runIt) : await runIt()
      } catch (err) {
        // Docker itself unavailable (daemon down, image missing) — validation
        // can't run at all. Don't fail the generation over infrastructure.
        onEvent({
          type: 'tool-result',
          id: callId,
          tool: 'run_command',
          ok: false,
          preview: `validation skipped: ${err instanceof Error ? err.message : String(err)}`,
          durationMs: Date.now() - started,
        })
        return null
      }
      const tail = lines.slice(-30).join('\n')
      onEvent({
        type: 'tool-result',
        id: callId,
        tool: 'run_command',
        ok: exitCode === 0,
        preview: exitCode === 0 ? `${cmd} exit 0` : preview40Lines(tail),
        durationMs: Date.now() - started,
      })
      if (exitCode !== 0) {
        if (signal.aborted) return null
        fatalLog = lines.join('\n')
        fatalCmd = cmd
        break
      }
      if (cmd === 'foamRun') {
        // Exit 0 with nan fields is a diverged solve, not a pass.
        const diverged = findDivergedField(caseDir)
        if (diverged) {
          fatalLog =
            `${lines.slice(-40).join('\n')}\n\nSOLUTION DIVERGED (no FATAL ERROR): field ${diverged.field} ` +
            `contains nan at time ${diverged.time}. Typical causes: time step too large for the physics ` +
            `(reduce maxDeltaT / add maxAlphaCo), missing or wrong pressure reference, bad initial ` +
            `conditions, or unbounded interface compression.`
          fatalCmd = 'foamRun'
          onEvent({
            type: 'tool-result',
            id: `validate_diverged_${round}`,
            tool: 'run_command',
            ok: false,
            preview: `foamRun exit 0 but ${diverged.field} is nan at t=${diverged.time} — diverged`,
            durationMs: 0,
          })
          break
        }
      }
    }

    if (!fatalLog) {
      const note =
        appliedFixDescriptions.length > 0
          ? `Validated automatically: blockMesh and a 20-step foamRun smoke-test pass (after ${appliedFixDescriptions.length} automatic fix${appliedFixDescriptions.length === 1 ? '' : 'es'}: ${appliedFixDescriptions.join('; ')}).`
          : 'Validated automatically: blockMesh and a 20-step foamRun smoke-test pass.'
      return { ok: true, note, fixedFiles }
    }

    if (round === VALIDATION_MAX_FIX_ROUNDS) {
      const firstFatal = fatalLog.split('\n').find((l) => l.includes('FATAL')) ?? `${fatalCmd} failed`
      return {
        ok: false,
        note: `⚠️ Automatic validation could not get the case running: \`${firstFatal.trim()}\`. Press Run to see the full log, or tell me the error and I'll fix it.`,
        fixedFiles,
      }
    }

    // Diagnose: fast rule-based first, then LLM fallback.
    const ruleDiagnosis = diagnose(fatalLog)
    const diagnosis = ruleDiagnosis ?? (await claudeDiagnose(fatalLog.split('\n').slice(-60).join('\n'), caseDir))
    if (!diagnosis || diagnosis.fix.length === 0) {
      const firstFatal = fatalLog.split('\n').find((l) => l.includes('FATAL')) ?? `${fatalCmd} failed`
      return {
        ok: false,
        note: `⚠️ ${fatalCmd} fails and I couldn't determine a safe automatic fix: \`${firstFatal.trim()}\`. Press Run for the full log, or paste the error here.`,
        fixedFiles,
      }
    }
    const applyResult = applyFixes(caseDir, diagnosis.fix)
    if (!applyResult.ok) {
      return {
        ok: false,
        note: `⚠️ ${fatalCmd} fails; the suggested fix could not be applied (${applyResult.message}). Press Run for the full log.`,
        fixedFiles,
      }
    }
    for (const f of diagnosis.fix) {
      fixedFiles.push(f.file)
      appliedFixDescriptions.push(`${f.file}: ${f.description}`)
      const fixId = `validate_fix_${round}_${f.file}`
      onEvent({ type: 'tool-call', id: fixId, tool: 'edit_case_file', args: { path: f.file } })
      onEvent({
        type: 'tool-result',
        id: fixId,
        tool: 'edit_case_file',
        ok: true,
        preview: f.description,
        durationMs: 0,
      })
    }
  }
  return null
}

function preview40Lines(text: string, max = 400): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

// ── Claude-based fallback diagnosis ──────────────────────────────────────────

const CLAUDE_DIAGNOSE_SYSTEM = `You are an OpenFOAM error recovery expert.
Given a FOAM FATAL ERROR log and the current case files, identify the root cause
and provide a minimal patch to fix it.

Respond with JSON only — no prose before or after:
{
  "errorClass": "short-slug",
  "description": "user-friendly explanation of the problem and fix",
  "fix": [
    {
      "file": "relative path, e.g. system/fvSolution",
      "description": "what this change does",
      "oldValue": "exact substring to replace (must exist verbatim in the file)",
      "newValue": "replacement string"
    }
  ]
}

Rules:
- To EDIT an existing file: oldValue must be an exact verbatim substring of the file content shown, and newValue is its replacement.
- To CREATE a missing file (a required dictionary that is entirely absent, e.g. constant/phaseProperties): set oldValue to "" (empty string) and put the file's COMPLETE content in newValue. Always prefer creating the file when the error is that it is missing.
- Keep changes minimal — only what is needed to fix the error.
- If no safe fix can be determined, return {"errorClass":"unknown","description":"...","fix":[]}.`

async function claudeDiagnose(log: string, caseDir: string): Promise<DiagnosisResult | null> {
  const filesToRead = ['system/fvSolution', 'system/fvSchemes', 'system/controlDict', '0/U', '0/p']
  const fileBlocks = filesToRead
    .map(f => {
      const full = path.join(caseDir, f)
      if (!fs.existsSync(full)) return null
      return `=== ${f} ===\n${fs.readFileSync(full, 'utf8')}`
    })
    .filter(Boolean)
    .join('\n\n')

  const userPrompt = `FOAM FATAL ERROR LOG (last 60 lines):\n${log}\n\nCASE FILES:\n${fileBlocks}`

  try {
    const { text } = await generateWithLLM(CLAUDE_DIAGNOSE_SYSTEM, userPrompt)
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0]) as DiagnosisResult
    if (!parsed.fix || !Array.isArray(parsed.fix)) return null
    return parsed
  } catch {
    return null
  }
}

// ── Server ────────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  // Serve frontend (renderer build, legacy HTML, or proxy to Vite dev server)
  if (req.method === 'GET' && url.pathname === '/') {
    if (USE_VITE_DEV) { proxyToVite(req, res); return }
    serveRendererAsset('/', res)
    return
  }

  // Health check
  if (req.method === 'GET' && url.pathname === '/health') {
    const result = await runHealthChecks(docker)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(result))
    return
  }

  if (req.method === 'POST' && url.pathname === '/health/fix') {
    const result = await repairHealthChecks(docker)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(result))
    return
  }

  // Streaming variant — emits SSE events so docker pull / npm install progress
  // surfaces in real time (P0: 4 GB image pull no longer looks frozen).
  if (req.method === 'POST' && url.pathname === '/health/fix/stream') {
    sseHeaders(res)
    try {
      const result = await repairHealthChecks(docker, {
        runCommand: (id, onLine) => runAllowedHostCommand(id, (line) => {
          sseWrite(res, { type: 'line', commandId: id, line })
          onLine?.(line)
        }),
      })
      sseWrite(res, { type: 'done', result })
    } catch (err) {
      sseWrite(res, { type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
    res.end()
    return
  }

  // Settings: BYOK provider config. GET returns redacted view; POST writes it.
  if (req.method === 'GET' && url.pathname === '/settings') {
    const cfg = readConfig()
    const provider = getActiveProvider(cfg)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      provider,
      model: getActiveModel(cfg),
      customBaseURL: cfg.customBaseURL ?? '',
      hasAuth: hasLLMAuth(cfg),
      hasKeys: {
        anthropic: !!getProviderKey('anthropic', cfg),
        openai: !!getProviderKey('openai', cfg),
        google: !!getProviderKey('google', cfg),
        'openai-compatible': !!getProviderKey('openai-compatible', cfg),
      },
      providers: (Object.keys(PROVIDER_LABELS) as LLMProvider[]).map(id => ({
        id,
        label: PROVIDER_LABELS[id],
        defaultModel: DEFAULT_MODEL[id],
        models: MODEL_OPTIONS[id] ?? [],
      })),
      // For back-compat with existing setup UI code
      hasApiKey: !!getProviderKey('anthropic', cfg),
    }))
    return
  }

  if (req.method === 'POST' && url.pathname === '/settings') {
    const body = await readBody(req)
    let payload: {
      provider?: LLMProvider
      model?: string
      apiKey?: string
      customBaseURL?: string
    } = {}
    try { payload = JSON.parse(body) ?? {} } catch { /* invalid body */ }

    const validProviders: LLMProvider[] = ['claude-cli', 'anthropic', 'openai', 'google', 'openai-compatible']
    if (payload.provider && !validProviders.includes(payload.provider)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: `Unknown provider: ${payload.provider}` }))
      return
    }

    const prev = readConfig()
    const next: AppConfig = { ...prev }

    if (payload.provider) next.llmProvider = payload.provider
    const effectiveProvider = next.llmProvider ?? getActiveProvider(prev)
    if (payload.model !== undefined || payload.provider) {
      // Accept any non-empty model ID — MODEL_OPTIONS is a suggestion list,
      // not an allowlist, so users can select models newer than this build.
      const requestedModel = payload.model?.trim()
      next.llmModel = requestedModel || DEFAULT_MODEL[effectiveProvider] || undefined
    }
    if (payload.customBaseURL !== undefined) next.customBaseURL = payload.customBaseURL.trim() || undefined

    if (payload.apiKey !== undefined) {
      const key = payload.apiKey.trim()
      const targetProvider = payload.provider ?? getActiveProvider(prev)
      if (targetProvider === 'claude-cli') {
        // no-op: CLI uses claude login
      } else {
        next.apiKeys = { ...(next.apiKeys ?? {}) }
        if (key) {
          next.apiKeys[targetProvider as Exclude<LLMProvider, 'claude-cli'>] = key
          if (targetProvider === 'anthropic') {
            next.anthropicApiKey = key
            process.env.ANTHROPIC_API_KEY = key
          }
        } else {
          delete next.apiKeys[targetProvider as Exclude<LLMProvider, 'claude-cli'>]
          if (targetProvider === 'anthropic') delete next.anthropicApiKey
        }
      }
    }

    writeConfig(next)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, hasAuth: hasLLMAuth(next) }))
    return
  }

  // Back-compat: old clients may still POST /settings/api-key with a raw Anthropic key.
  if (req.method === 'POST' && url.pathname === '/settings/api-key') {
    const body = await readBody(req)
    let apiKey = ''
    try { apiKey = (JSON.parse(body)?.apiKey ?? '').trim() } catch { /* invalid body */ }
    if (!apiKey || !apiKey.startsWith('sk-ant-')) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'API key must be a non-empty value starting with sk-ant-' }))
      return
    }
    const prev = readConfig()
    writeConfig({
      ...prev,
      anthropicApiKey: apiKey,
      apiKeys: { ...(prev.apiKeys ?? {}), anthropic: apiKey },
      llmProvider: prev.llmProvider ?? 'anthropic',
    })
    process.env.ANTHROPIC_API_KEY = apiKey
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  // Route: /api/projects[/<id>[/<action>]]
  const parts = url.pathname.split('/').filter(Boolean)

  if (parts[0] !== 'api' || parts[1] !== 'projects') {
    // Let non-API GETs fall through to the renderer asset fallback below.
    if (req.method !== 'GET') { res.writeHead(404); res.end('Not found'); return }
    if (USE_VITE_DEV) { proxyToVite(req, res); return }
    if (serveRendererAsset(url.pathname, res)) return
    res.writeHead(404); res.end('Not found'); return
  }

  // GET /api/projects → list
  if (parts.length === 2 && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(listProjects()))
    return
  }

  // POST /api/projects → create
  if (parts.length === 2 && req.method === 'POST') {
    const body = await readBody(req)
    let name = 'New Simulation'
    let prompt = ''
    try {
      const parsed = JSON.parse(body)
      name = parsed?.name ?? name
      prompt = (parsed?.prompt ?? '').trim()
    } catch { /* default */ }
    const id = randomUUID().slice(0, 8)
    const meta: ProjectMeta = { id, name, prompt, status: 'idle', createdAt: new Date().toISOString(), messages: [], retryCount: 0 }
    writeMeta(id, meta)
    res.writeHead(201, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(meta))
    return
  }

  const projectId = parts[2]
  const action = parts[3]

  if (!projectId) { res.writeHead(400); res.end('Missing project id'); return }

  // GET /api/projects/<id> → get meta
  if (!action && req.method === 'GET') {
    const meta = readMeta(projectId)
    if (!meta) { res.writeHead(404); res.end('Not found'); return }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(meta))
    return
  }

  // DELETE /api/projects/<id> → delete project
  if (!action && req.method === 'DELETE') {
    fs.rmSync(path.join(PROJECTS_DIR, projectId), { recursive: true, force: true })
    res.writeHead(204); res.end()
    return
  }

  // GET /api/projects/<id>/files → list case files
  if (action === 'files' && req.method === 'GET') {
    const files = getAllFiles(projectCaseDir(projectId))
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(files.map(f => ({ relPath: f.relPath }))))
    return
  }

  // GET /api/projects/<id>/file?path= → read file
  if (action === 'file' && req.method === 'GET') {
    const relPath = url.searchParams.get('path') ?? ''
    const caseDir = projectCaseDir(projectId)
    const resolved = path.resolve(caseDir, relPath)
    // path.relative catches traversal on all platforms; startsWith(caseDir) alone
    // would also pass paths like "<caseDir>Evil" if sep check is missing.
    const rel = path.relative(caseDir, resolved)
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      res.writeHead(400); res.end('Bad path'); return
    }
    if (!fs.existsSync(resolved)) { res.writeHead(404); res.end('Not found'); return }
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(fs.readFileSync(resolved, 'utf8'))
    return
  }

  // PUT /api/projects/<id>/file?path= → write file (LF normalized for OpenFOAM)
  if (action === 'file' && req.method === 'PUT') {
    const relPath = url.searchParams.get('path') ?? ''
    const caseDir = projectCaseDir(projectId)
    const resolved = path.resolve(caseDir, relPath)
    const rel = path.relative(caseDir, resolved)
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      res.writeHead(400); res.end('Bad path'); return
    }
    const body = await readBody(req)
    let content: string
    try {
      const parsed = JSON.parse(body)
      content = typeof parsed?.content === 'string' ? parsed.content : ''
    } catch {
      res.writeHead(400); res.end('Body must be JSON {content: string}'); return
    }
    fs.mkdirSync(path.dirname(resolved), { recursive: true })
    fs.writeFileSync(resolved, content.replace(/\r\n/g, '\n'), 'utf8')
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  // GET /api/projects/<id>/vtk/manifest → list VTK files written by foamToVTK
  if (action === 'vtk' && parts[4] === 'manifest' && req.method === 'GET') {
    const vtkDir = path.join(projectCaseDir(projectId), 'VTK')
    if (!fs.existsSync(vtkDir)) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ files: [] }))
      return
    }
    const VTK_EXT = new Set(['.vtu', '.vtp', '.vtm', '.vtk'])
    type VtkEntry = {
      relPath: string; size: number; ext: string
      time: number | null; kind: string; patchName: string | null
    }
    const entries: VtkEntry[] = []
    const walk = (dir: string) => {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name)
        const st = fs.statSync(full)
        if (st.isDirectory()) { walk(full); continue }
        const ext = path.extname(name).toLowerCase()
        if (!VTK_EXT.has(ext)) continue
        const rel = path.relative(vtkDir, full).split(path.sep).join('/')
        // Layout classification + time parsing live in core/postprocess/vtkSeries.
        const info = classifyVtkFile(rel)
        entries.push({
          relPath: rel, size: st.size, ext,
          time: info.time, kind: info.kind, patchName: info.patchName,
        })
      }
    }
    walk(vtkDir)
    entries.sort((a, b) => {
      const av = a.time ?? -1, bv = b.time ?? -1
      if (av !== bv) return av - bv
      return a.relPath.localeCompare(b.relPath)
    })
    const series = buildVtkSeries(entries.map((e) => e.relPath))
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ files: entries, series }))
    return
  }

  // GET /api/projects/<id>/vtk/file?path= → stream a VTK file (binary-safe)
  if (action === 'vtk' && parts[4] === 'file' && req.method === 'GET') {
    const relPath = url.searchParams.get('path') ?? ''
    const vtkDir = path.join(projectCaseDir(projectId), 'VTK')
    const resolved = path.resolve(vtkDir, relPath)
    const rel = path.relative(vtkDir, resolved)
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      res.writeHead(400); res.end('Bad path'); return
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      res.writeHead(404); res.end('Not found'); return
    }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
    fs.createReadStream(resolved).pipe(res)
    return
  }

  // GET /api/projects/<id>/runs → list run records (newest first)
  if (action === 'runs' && req.method === 'GET' && parts.length === 4) {
    const records = readJsonl<RunRecord>(projectRunsJsonl(projectId))
    records.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(records))
    return
  }

  // GET /api/projects/<id>/runs/<runId>/log → stored log text
  if (action === 'runs' && req.method === 'GET' && parts.length === 6 && parts[5] === 'log') {
    const runId = parts[4]!
    if (!/^[a-zA-Z0-9-]+$/.test(runId)) { res.writeHead(400); res.end('Bad runId'); return }
    const logFile = projectRunLogPath(projectId, runId)
    if (!fs.existsSync(logFile)) { res.writeHead(404); res.end('Log not found'); return }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(fs.readFileSync(logFile, 'utf8'))
    return
  }

  // GET /api/projects/<id>/commands → command records (newest first, paginated)
  if (action === 'commands' && req.method === 'GET') {
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '200', 10) || 200, 1000)
    const all = readJsonl<CommandRecord>(projectCommandsJsonl(projectId))
    all.sort((a, b) => b.ts.localeCompare(a.ts))
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(all.slice(0, limit)))
    return
  }

  // POST /api/projects/<id>/generate → SSE generate
  if (action === 'generate' && req.method === 'POST') {
    await handleGenerate(projectId, req, res)
    return
  }

  // DELETE /api/projects/<id>/messages → clear chat history
  if (action === 'messages' && req.method === 'DELETE') {
    const m = readMeta(projectId)
    if (!m) { res.writeHead(404); res.end('Not found'); return }
    writeMeta(projectId, { ...m, messages: [] })
    res.writeHead(204); res.end()
    return
  }

  // POST /api/projects/<id>/run → SSE run
  if (action === 'run' && req.method === 'POST') {
    // Reset retryCount on every fresh user-initiated run
    const runMeta = readMeta(projectId)
    if (runMeta) writeMeta(projectId, { ...runMeta, retryCount: 0 })
    await handleRun(projectId, req, res)
    return
  }

  // POST /api/projects/<id>/postprocess → SSE foamToVTK conversion for Results tab
  if (action === 'postprocess' && req.method === 'POST') {
    await handlePostprocess(projectId, req, res)
    return
  }

  // POST /api/projects/<id>/apply-fix → apply a FileFix, increment retryCount, re-run (SSE)
  if (action === 'apply-fix' && req.method === 'POST') {
    const body = await readBody(req)
    let fixes: FileFix[] = []
    try { fixes = JSON.parse(body)?.fix ?? [] } catch { /* fall through to 400 */ }
    if (!fixes.length) { res.writeHead(400); res.end('Missing fix array'); return }

    const applyMeta = readMeta(projectId)
    if (!applyMeta) { res.writeHead(404); res.end('Project not found'); return }

    if ((applyMeta.retryCount ?? 0) >= 3) {
      res.writeHead(400); res.end('Max retries reached'); return
    }

    const caseDir = projectCaseDir(projectId)

    // Apply each fix (path-guarded; supports create-file when oldValue is empty)
    const applyResult = applyFixes(caseDir, fixes)
    if (!applyResult.ok) {
      res.writeHead(applyResult.status); res.end(applyResult.message); return
    }

    // Persist fix summary to conversation history
    const fixSummary = fixes.map(f => `• ${f.file}: ${f.description}`).join('\n')
    const assistantMsg: Message = {
      role: 'assistant',
      content: `Applied fix (attempt ${(applyMeta.retryCount ?? 0) + 1}):\n${fixSummary}\n\nRe-running simulation...`,
    }
    writeMeta(projectId, {
      ...applyMeta,
      retryCount: (applyMeta.retryCount ?? 0) + 1,
      messages: [...applyMeta.messages, assistantMsg],
    })

    await handleRun(projectId, req, res)
    return
  }

  // Fallback: in dev, proxy unmatched GETs to Vite (assets, HMR). In prod,
  // try to serve from renderer/dist.
  if (req.method === 'GET') {
    if (USE_VITE_DEV) { proxyToVite(req, res); return }
    if (serveRendererAsset(url.pathname, res)) return
  }

  res.writeHead(404); res.end('Not found')
})

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[server] Port ${PORT} is already in use. Is another instance running?`)
    const killHint = process.platform === 'win32'
      ? `netstat -ano | findstr :${PORT}  →  taskkill /PID <PID> /F`
      : `lsof -ti:${PORT} | xargs kill -9`
    console.error(`[server] Kill it with: ${killHint}`)
    process.exit(1)
  }
  throw err
})

// Bind loopback only — this server exposes project files and Docker execution,
// so it must never listen on LAN interfaces. Override with OFS_HOST at your own risk.
const HOST = process.env.OFS_HOST ?? '127.0.0.1'
server.listen(PORT, HOST, () => {
  console.log(`OpenFOAM Studio server listening on http://${HOST}:${PORT}`)
})
