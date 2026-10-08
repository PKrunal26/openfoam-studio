/**
 * Tools available to the AgentLoop. Each tool's `execute` validates inputs,
 * enforces path/command safety, and emits `tool-call` / `tool-result` events
 * via `onEvent` so the renderer can show step-by-step progress.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { tool } from 'ai'
import { z } from 'zod'
import type Docker from 'dockerode'

import { runDockerCommand, meshCheckPassed } from '../docker/CommandRunner.js'
import { safeCasePath, assertSafeDictionary } from '../run/casePolicy.js'
import { validateCaseInIsolation } from '../run/validateCase.js'
import { getDocsIndex } from './DocsIndex.js'

/** Public event surface emitted as tools execute. The server forwards these as SSE. */
export type AgentEvent =
  | { type: 'agent-step'; index: number; text?: string }
  | { type: 'tool-call'; id: string; tool: string; args: unknown }
  | { type: 'tool-progress'; id: string; line: string }
  | { type: 'tool-result'; id: string; tool: string; ok: boolean; preview?: string; durationMs: number }
  | { type: 'file'; path: string; size: number }
  | { type: 'finish'; summary: string }

export interface MakeToolsOptions {
  /** Absolute path to the project's case/ directory. */
  caseDir: string
  /** Optional Docker handle. If omitted, run_command throws — use for tests. */
  docker?: Docker | null
  /** Hard cap on solver smoke-test step count. */
  maxSolverSteps?: number
  signal?: AbortSignal
  readOnly?: boolean
  /** Emit a streaming progress / result event. */
  onEvent: (e: AgentEvent) => void
  /** Set by AgentLoop when finish is called. AgentLoop also enforces the stop. */
  onFinish?: (summary: string) => void
}

const MAX_SOLVER_STEPS_DEFAULT = 50
const ALLOWED_RUN_COMMANDS = new Set(['blockMesh', 'checkMesh', 'setFields', 'foamRun'])


let _toolCallSeq = 0
function nextToolCallId(): string {
  _toolCallSeq = (_toolCallSeq + 1) % 1_000_000
  return `tc_${Date.now().toString(36)}_${_toolCallSeq.toString(36)}`
}

/** Resolve a case-relative path to an absolute path under caseDir, or throw. */
function safeJoin(caseDir: string, rel: string): string {
  if (typeof rel !== 'string' || rel.length === 0) {
    throw new Error('path must be a non-empty string')
  }
  if (rel.includes('\0')) throw new Error('path contains NUL byte')
  if (path.isAbsolute(rel)) throw new Error('path must be relative to case/')
  const normalised = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  const abs = path.resolve(caseDir, normalised)
  const guard = path.join(path.resolve(caseDir), path.sep)
  if (abs !== path.resolve(caseDir) && !abs.startsWith(guard)) {
    throw new Error(`path escapes case directory: ${rel}`)
  }
  let current = path.resolve(caseDir)
  if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Case root cannot be a link')
  for (const part of path.relative(current, abs).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Symbolic links are not permitted') }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  return abs
}

function listCaseFilesRecursive(caseDir: string): string[] {
  if (!fs.existsSync(caseDir)) return []
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) out.push(path.relative(caseDir, full).replace(/\\/g, '/'))
    }
  }
  walk(caseDir)
  return out.sort()
}

function preview(text: string, max = 240): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

/** Parse deltaT/startTime from system/controlDict for smoke-test endTime capping. */
export function readTimeControls(caseDir: string): { deltaT: number; startTime: number } {
  let deltaT = 0.005
  let startTime = 0
  try {
    const content = fs.readFileSync(path.join(caseDir, 'system', 'controlDict'), 'utf8')
    const dt = /(?:^|\n)\s*deltaT\s+([0-9.eE+-]+)\s*;/.exec(content)
    const st = /(?:^|\n)\s*startTime\s+([0-9.eE+-]+)\s*;/.exec(content)
    const dtv = dt ? parseFloat(dt[1]!) : NaN
    const stv = st ? parseFloat(st[1]!) : NaN
    if (Number.isFinite(dtv) && dtv > 0) deltaT = dtv
    if (Number.isFinite(stv) && stv >= 0) startTime = stv
  } catch { /* keep defaults */ }
  return { deltaT, startTime }
}

/**
 * Run `fn` with system/controlDict's endTime temporarily capped to
 * startTime + steps·deltaT, restoring the original file afterwards.
 *
 * foamRun has no -endTime CLI flag (OF13 rejects it with "Invalid option"),
 * so a bounded smoke-test has to go through the dictionary itself.
 */
export async function withCappedEndTime<T>(
  caseDir: string,
  steps: number,
  fn: () => Promise<T>,
): Promise<T> {
  const controlDictPath = path.join(caseDir, 'system', 'controlDict')
  const original = fs.readFileSync(controlDictPath, 'utf8')
  const { deltaT, startTime } = readTimeControls(caseDir)
  const target = startTime + steps * deltaT
  const capped = original.replace(
    /((?:^|\n)\s*)endTime\s+[^;]+;/,
    `$1endTime         ${target};`,
  )
  if (capped === original && !/(?:^|\n)\s*endTime\s/.test(original)) {
    // No endTime entry at all — leave the dict alone; foamRun will fail with
    // a clear message the model can act on.
    return fn()
  }
  fs.writeFileSync(controlDictPath, capped, 'utf8')
  try {
    return await fn()
  } finally {
    fs.writeFileSync(controlDictPath, original, 'utf8')
  }
}

/** A tool transport completing is not evidence that its domain operation succeeded. */
export function toolResultSucceeded(result: unknown): boolean {
  if (!result || typeof result !== 'object') return true
  const value = result as Record<string, unknown>
  return value['ok'] !== false && !value['error'] &&
    (typeof value['exitCode'] !== 'number' || value['exitCode'] === 0)
}

/**
 * Wrap a tool `execute` so call/result events are emitted automatically and
 * errors are caught and reported as `ok: false` results (the AI SDK then
 * surfaces the message back to the model so it can recover).
 */
function withTracing<TInput, TOutput>(opts: {
  toolName: string
  onEvent: (e: AgentEvent) => void
  signal?: AbortSignal | undefined
  fn: (input: TInput, id: string) => Promise<TOutput>
}): (input: TInput) => Promise<TOutput | { error: string }> {
  return async (input: TInput) => {
    const id = nextToolCallId()
    const started = Date.now()
    opts.onEvent({ type: 'tool-call', id, tool: opts.toolName, args: input })
    try {
      opts.signal?.throwIfAborted()
      const result = await opts.fn(input, id)
      opts.signal?.throwIfAborted()
      opts.onEvent({
        type: 'tool-result',
        id,
        tool: opts.toolName,
        ok: toolResultSucceeded(result),
        preview: preview(typeof result === 'string' ? result : JSON.stringify(result)),
        durationMs: Date.now() - started,
      })
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      opts.onEvent({
        type: 'tool-result',
        id,
        tool: opts.toolName,
        ok: false,
        preview: message,
        durationMs: Date.now() - started,
      })
      return { error: message }
    }
  }
}

export function makeTools(opts: MakeToolsOptions) {
  const { caseDir, docker, onEvent, onFinish } = opts
  const maxSolverSteps = opts.maxSolverSteps ?? MAX_SOLVER_STEPS_DEFAULT

  const tools = {
    list_case_files: tool({
      description:
        'List every file currently in the project case directory. Returns relative paths under case/.',
      inputSchema: z.object({}),
      execute: withTracing({
        toolName: 'list_case_files',
        onEvent,
        signal: opts.signal,
        fn: async () => {
          return { files: listCaseFilesRecursive(caseDir) }
        },
      }),
    }),

    read_case_file: tool({
      description: 'Read the content of a case file. The path is relative to case/.',
      inputSchema: z.object({
        path: z.string().describe('Case-relative path, e.g. "system/controlDict"'),
      }),
      execute: withTracing({
        toolName: 'read_case_file',
        onEvent,
        signal: opts.signal,
        fn: async (input: { path: string }) => {
          const abs = safeJoin(caseDir, input.path)
          if (!fs.existsSync(abs)) throw new Error(`file does not exist: ${input.path}`)
          const stat = fs.statSync(abs)
          if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw new Error('Not a bounded regular case file')
          const content = fs.readFileSync(abs, 'utf8')
          return { path: input.path, content }
        },
      }),
    }),

    write_case_file: tool({
      description:
        'Create or overwrite a case file with the given content. Creates parent directories. ' +
        'Always normalises CRLF to LF. Path is relative to case/. Use this for every file you ' +
        'produce — do NOT dump JSON.',
      inputSchema: z.object({
        path: z.string().describe('Case-relative path, e.g. "0/U" or "system/blockMeshDict"'),
        content: z.string().describe('Complete file content. LF line endings.'),
      }),
      execute: withTracing({
        toolName: 'write_case_file',
        onEvent,
        signal: opts.signal,
        fn: async (input: { path: string; content: string }) => {
          if (opts.readOnly) throw new Error('This question is read-only')
          const abs = safeCasePath(caseDir, input.path)
          assertSafeDictionary(input.content, input.path)
          fs.mkdirSync(path.dirname(abs), { recursive: true })
          const normalised = input.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
          fs.writeFileSync(abs, normalised, 'utf8')
          onEvent({ type: 'file', path: input.path, size: Buffer.byteLength(normalised, 'utf8') })
          return { path: input.path, bytesWritten: Buffer.byteLength(normalised, 'utf8') }
        },
      }),
    }),

    edit_case_file: tool({
      description:
        'Replace exact text in a case file. oldText must occur exactly once or the call fails. ' +
        'Prefer this over write_case_file when changing one block of an existing file.',
      inputSchema: z.object({
        path: z.string(),
        oldText: z.string().describe('Exact text to replace; must be unique in the file.'),
        newText: z.string().describe('Replacement text.'),
      }),
      execute: withTracing({
        toolName: 'edit_case_file',
        onEvent,
        signal: opts.signal,
        fn: async (input: { path: string; oldText: string; newText: string }) => {
          if (opts.readOnly) throw new Error('This question is read-only')
          if (!input.oldText) throw new Error('oldText must not be empty')
          const abs = safeCasePath(caseDir, input.path)
          if (!fs.existsSync(abs)) throw new Error(`file does not exist: ${input.path}`)
          const original = fs.readFileSync(abs, 'utf8')
          const occurrences = original.split(input.oldText).length - 1
          if (occurrences === 0) throw new Error('oldText not found in file')
          if (occurrences > 1) {
            throw new Error(
              `oldText is not unique (found ${occurrences} occurrences). Provide more context.`,
            )
          }
          const updated = original.replace(input.oldText, input.newText).replace(/\r\n/g, '\n')
          assertSafeDictionary(updated, input.path)
          fs.writeFileSync(abs, updated.replace(/\r/g, '\n'), 'utf8')
          onEvent({ type: 'file', path: input.path, size: Buffer.byteLength(updated, 'utf8') })
          return { path: input.path, bytesWritten: Buffer.byteLength(updated, 'utf8') }
        },
      }),
    }),

    search_docs: tool<{ query: string; k?: number }, unknown>({
      description:
        'Search the OpenFOAM 13 documentation cache and the project wiki for a keyword/phrase. ' +
        'Returns up to k ranked snippets; call read_doc on the path field for the full text.',
      // Cast: zod v4's ZodObject matches the AI SDK's z4.core.$ZodType union member at
      // runtime, but TS picks the v3 branch when the schema has optional fields and
      // can't reconcile. The schema is validated by the SDK at call time.
      inputSchema: z.object({
        query: z.string().describe('Free-text query, e.g. "blockMeshDict patches"'),
        k: z.number().int().min(1).max(10).optional(),
      }) as never,
      execute: withTracing({
        toolName: 'search_docs',
        onEvent,
        signal: opts.signal,
        fn: async (input: { query: string; k?: number }) => {
          const idx = getDocsIndex()
          const hits = idx.search(input.query, input.k ?? 5).map((h) => ({
            path: h.path,
            heading: h.heading,
            preview: h.preview,
            source: h.source,
          }))
          return { query: input.query, hits, indexSize: idx.size() }
        },
      }),
    }),

    read_doc: tool({
      description:
        'Read a full documentation or wiki file by repo-relative path (must live under docs/openfoam-v13/ ' +
        'or wiki/). Use the `path` field returned by search_docs.',
      inputSchema: z.object({
        path: z.string().describe('Repo-relative path under docs/openfoam-v13/ or wiki/'),
      }),
      execute: withTracing({
        toolName: 'read_doc',
        onEvent,
        signal: opts.signal,
        fn: async (input: { path: string }) => {
          const idx = getDocsIndex()
          const content = idx.read(input.path)
          if (!content) throw new Error(`doc not found or outside allowed dirs: ${input.path}`)
          return { path: input.path, content }
        },
      }),
    }),

    run_command: tool<{ cmd: 'blockMesh' | 'checkMesh' | 'setFields' | 'foamRun'; steps?: number }, unknown>({
      description:
        'Run an OpenFOAM command inside the project case directory. ' +
        'Allowed commands: blockMesh, checkMesh, setFields, foamRun. ' +
        'foamRun is auto-capped at a small step count for smoke-testing — use it to verify the case actually solves.',
      inputSchema: z.object({
        cmd: z.enum(['blockMesh', 'checkMesh', 'setFields', 'foamRun']),
        steps: z
          .number()
          .int()
          .min(1)
          .max(MAX_SOLVER_STEPS_DEFAULT)
          .optional()
          .describe('foamRun only — number of steps for the smoke-test (default 5, max 50).'),
      }) as never,
      execute: withTracing({
        toolName: 'run_command',
        onEvent,
        signal: opts.signal,
        fn: async (input: { cmd: 'blockMesh' | 'checkMesh' | 'setFields' | 'foamRun'; steps?: number }, id) => {
          if (!ALLOWED_RUN_COMMANDS.has(input.cmd)) {
            throw new Error(`command not allowed: ${input.cmd}`)
          }
          if (opts.readOnly) throw new Error('This question is read-only')
          if ((input.cmd === 'blockMesh' || input.cmd === 'checkMesh') &&
              !fs.existsSync(safeJoin(caseDir, 'system/blockMeshDict'))) {
            throw new Error('cannot run mesh commands before system/blockMeshDict exists')
          }
          if (!docker) throw new Error('Docker is not available in this environment')
          const captured: string[] = []
          let lastSent = Date.now()
          let exitCode = -1
          const runIt = async () => {
            try {
              exitCode = await runDockerCommand(docker, {
                command: input.cmd,
                args: [],
                caseDir,
                ...(opts.signal ? { signal: opts.signal } : {}),
                onLine: (line) => {
                  captured.push(line)
                  if (captured.length > 20_000) captured.shift()
                  // Throttle to 1 line / 80ms so the UI doesn't drown.
                  const now = Date.now()
                  if (now - lastSent >= 80 || captured.length <= 5) {
                    onEvent({ type: 'tool-progress', id, line })
                    lastSent = now
                  }
                },
              })
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              throw new Error(`docker exec failed: ${message}`)
            }
          }

          if (input.cmd === 'foamRun') {
            const validation = await validateCaseInIsolation(docker, caseDir, {
              ...(opts.signal ? { signal: opts.signal } : {}),
              steps: Math.min(input.steps ?? 5, maxSolverSteps),
              onLine: line => onEvent({ type: 'tool-progress', id, line }),
            })
            return { cmd: input.cmd, ok: validation.ok, exitCode: validation.ok ? 0 : -1,
              smokeTestSteps: Math.min(input.steps ?? 5, maxSolverSteps),
              meshChecked: validation.meshChecked, solverAdvanced: validation.solverAdvanced,
              outputTail: validation.log.slice(-4000), failedCommand: validation.failedCommand }
          }
          await runIt()

          const tail = captured.slice(-30).join('\n')
          return {
            cmd: input.cmd,
            exitCode,
            ok: input.cmd === 'checkMesh' ? meshCheckPassed(exitCode, captured.join('\n')) : exitCode === 0 && !/FOAM FATAL/.test(captured.join('\n')),
            outputTail: tail,
            totalLines: captured.length,
          }
        },
      }),
    }),

    finish: tool({
      description:
        'End the turn and deliver your final message to the user. Call this when the case is ' +
        'generated and validated, when you have answered a question that needed no file changes, ' +
        'or when you are blocked and need to explain why. The summary is rendered as Markdown.',
      inputSchema: z.object({
        summary: z
          .string()
          .describe('Final Markdown message for the user: what you did/found, and what to do next.'),
      }),
      execute: withTracing({
        toolName: 'finish',
        onEvent,
        signal: opts.signal,
        fn: async (input: { summary: string }) => {
          onEvent({ type: 'finish', summary: input.summary })
          onFinish?.(input.summary)
          return { done: true, summary: input.summary }
        },
      }),
    }),
  }
  if (opts.readOnly) {
    // Keep the return type stable for callers; the model sees only the actual keys.
    const available = tools as Partial<typeof tools>
    delete available.write_case_file
    delete available.edit_case_file
    delete available.run_command
  }
  return tools
}
