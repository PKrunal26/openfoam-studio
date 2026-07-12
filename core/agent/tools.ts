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

import { runDockerCommand } from '../docker/CommandRunner.js'
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
  /** Emit a streaming progress / result event. */
  onEvent: (e: AgentEvent) => void
  /** Set by AgentLoop when finish is called. AgentLoop also enforces the stop. */
  onFinish?: (summary: string) => void
}

const MAX_SOLVER_STEPS_DEFAULT = 50
const ALLOWED_RUN_COMMANDS = new Set(['blockMesh', 'checkMesh', 'foamRun'])
const REQUIRED_SOLVER_FILES = [
  '0/U',
  '0/p',
  'constant/physicalProperties',
  'constant/momentumTransport',
  'system/blockMeshDict',
  'system/controlDict',
  'system/fvSchemes',
  'system/fvSolution',
]

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
  const guard = path.resolve(caseDir) + path.sep
  if (abs !== path.resolve(caseDir) && !abs.startsWith(guard)) {
    throw new Error(`path escapes case directory: ${rel}`)
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

/**
 * Wrap a tool `execute` so call/result events are emitted automatically and
 * errors are caught and reported as `ok: false` results (the AI SDK then
 * surfaces the message back to the model so it can recover).
 */
function withTracing<TInput, TOutput>(opts: {
  toolName: string
  onEvent: (e: AgentEvent) => void
  fn: (input: TInput, id: string) => Promise<TOutput>
}): (input: TInput) => Promise<TOutput | { error: string }> {
  return async (input: TInput) => {
    const id = nextToolCallId()
    const started = Date.now()
    opts.onEvent({ type: 'tool-call', id, tool: opts.toolName, args: input })
    try {
      const result = await opts.fn(input, id)
      opts.onEvent({
        type: 'tool-result',
        id,
        tool: opts.toolName,
        ok: true,
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

  return {
    list_case_files: tool({
      description:
        'List every file currently in the project case directory. Returns relative paths under case/.',
      inputSchema: z.object({}),
      execute: withTracing({
        toolName: 'list_case_files',
        onEvent,
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
        fn: async (input: { path: string }) => {
          const abs = safeJoin(caseDir, input.path)
          if (!fs.existsSync(abs)) throw new Error(`file does not exist: ${input.path}`)
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
        fn: async (input: { path: string; content: string }) => {
          const abs = safeJoin(caseDir, input.path)
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
        fn: async (input: { path: string; oldText: string; newText: string }) => {
          const abs = safeJoin(caseDir, input.path)
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
          fs.writeFileSync(abs, updated, 'utf8')
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
        fn: async (input: { path: string }) => {
          const idx = getDocsIndex()
          const content = idx.read(input.path)
          if (!content) throw new Error(`doc not found or outside allowed dirs: ${input.path}`)
          return { path: input.path, content }
        },
      }),
    }),

    run_command: tool<{ cmd: 'blockMesh' | 'checkMesh' | 'foamRun'; steps?: number }, unknown>({
      description:
        'Run an OpenFOAM command inside the project case directory. ' +
        'Allowed commands: blockMesh, checkMesh, foamRun. ' +
        'foamRun is auto-capped at a small step count for smoke-testing — use it to verify the case actually solves.',
      inputSchema: z.object({
        cmd: z.enum(['blockMesh', 'checkMesh', 'foamRun']),
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
        fn: async (input: { cmd: 'blockMesh' | 'checkMesh' | 'foamRun'; steps?: number }, id) => {
          if (!ALLOWED_RUN_COMMANDS.has(input.cmd)) {
            throw new Error(`command not allowed: ${input.cmd}`)
          }
          if (input.cmd === 'foamRun') {
            const missing = REQUIRED_SOLVER_FILES.filter((rel) => !fs.existsSync(safeJoin(caseDir, rel)))
            if (missing.length > 0) {
              throw new Error(`cannot run foamRun before required files exist: ${missing.join(', ')}`)
            }
          }
          if ((input.cmd === 'blockMesh' || input.cmd === 'checkMesh') &&
              !fs.existsSync(safeJoin(caseDir, 'system/blockMeshDict'))) {
            throw new Error('cannot run mesh commands before system/blockMeshDict exists')
          }
          if (!docker) throw new Error('Docker is not available in this environment')
          const args: string[] = []
          if (input.cmd === 'foamRun') {
            const steps = Math.min(input.steps ?? 5, maxSolverSteps)
            // foamRun takes "-endTime" / "-deltaT" flags; we cap by overriding endTime
            // proportionally. Most cases use deltaT=0.005, so 5 steps ≈ endTime 0.025.
            // Simplest portable approach: pass -endTime=<steps*0.005>.
            args.push(`-endTime`, String(steps * 0.005))
          }

          const captured: string[] = []
          let lastSent = Date.now()
          let exitCode = -1
          try {
            exitCode = await runDockerCommand(docker, {
              command: input.cmd,
              args,
              caseDir,
              onLine: (line) => {
                captured.push(line)
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

          const tail = captured.slice(-30).join('\n')
          return {
            cmd: input.cmd,
            args,
            exitCode,
            ok: exitCode === 0,
            outputTail: tail,
            totalLines: captured.length,
          }
        },
      }),
    }),

    finish: tool({
      description:
        'Call this once you are satisfied the case is correct and runs cleanly. Provide a one-paragraph ' +
        'summary of what you generated. After this call, the loop ends.',
      inputSchema: z.object({
        summary: z.string().describe('Plain-text summary for the user (1-3 sentences).'),
      }),
      execute: withTracing({
        toolName: 'finish',
        onEvent,
        fn: async (input: { summary: string }) => {
          const files = listCaseFilesRecursive(caseDir)
          if (files.length === 0) {
            throw new Error('cannot finish: no case files have been written yet')
          }
          onEvent({ type: 'finish', summary: input.summary })
          onFinish?.(input.summary)
          return { done: true, summary: input.summary }
        },
      }),
    }),
  }
}
