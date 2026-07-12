/**
 * Run Claude Code in headless agent mode against a project case directory.
 *
 * The user has the `claude` CLI authenticated locally (no API key required).
 * Claude Code already implements a multi-turn agent loop with Read/Write/Edit
 * tools — we spawn it with `--print --output-format stream-json` and pipe
 * each event into our own SSE vocabulary so the renderer's AgentStepsBlock
 * shows the same tool-by-tool progress users get from the AI SDK loop.
 *
 * Trade-off vs. the AI SDK loop: the host `claude` CLI's Bash tool runs on
 * the host (no Docker), so we don't expose blockMesh/checkMesh/foamRun here.
 * The model still iterates on file content but doesn't validate via the
 * solver — that step is left to the explicit "Run" button in the UI.
 */

import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { findClaudeBin } from './claude-runner.js'

import { AGENT_SYSTEM_PROMPT } from './prompts/agent-system-prompt.js'
import type { AgentEvent } from './tools.js'
import type { Message } from './types.js'

export interface RunClaudeAgentOptions {
  caseDir: string
  prompt: string
  history?: Message[]
  onEvent: (e: AgentEvent) => void
  signal?: AbortSignal
}

export interface ClaudeAgentResult {
  finishReason: 'success' | 'error' | 'aborted'
  stepCount: number
  finishSummary: string | null
  /** Plain-text final result from Claude (the `result` field of the final event). */
  finalText: string
}

/** Claude CLI stream-json event shape (the subset we care about). */
interface CliStreamEvent {
  type: 'system' | 'assistant' | 'user' | 'result' | string
  subtype?: string
  // For assistant messages
  message?: {
    content?: Array<
      | { type: 'text'; text: string }
      | { type: 'tool_use'; id: string; name: string; input: unknown }
      | { type: 'tool_result'; tool_use_id: string; content?: unknown; is_error?: boolean }
    >
    role?: string
  }
  // For result events
  result?: string
  is_error?: boolean
}

const TOOL_NAME_MAP: Record<string, string> = {
  Read: 'read_case_file',
  Write: 'write_case_file',
  Edit: 'edit_case_file',
  Glob: 'list_case_files',
  Grep: 'list_case_files',
}

/** Map a Claude CLI tool input back into our agent event vocabulary. */
function normaliseToolInput(toolName: string, input: unknown, caseDir: string): unknown {
  if (!input || typeof input !== 'object') return input
  const i = input as Record<string, unknown>
  if (toolName === 'Read' || toolName === 'Write' || toolName === 'Edit') {
    const filePath = typeof i['file_path'] === 'string' ? (i['file_path'] as string) : undefined
    if (filePath) {
      const rel = path.relative(caseDir, filePath).replace(/\\/g, '/')
      const safeRel = rel.startsWith('..') ? filePath : rel
      if (toolName === 'Write') return { path: safeRel, content: typeof i['content'] === 'string' ? i['content'] : '' }
      if (toolName === 'Edit') return { path: safeRel, oldText: i['old_string'], newText: i['new_string'] }
      return { path: safeRel }
    }
  }
  return input
}

function previewToolResult(content: unknown, max = 300): string {
  let text = ''
  if (typeof content === 'string') {
    text = content
  } else if (Array.isArray(content)) {
    text = content
      .map((c) => (c && typeof c === 'object' && 'text' in c && typeof (c as { text: unknown }).text === 'string' ? (c as { text: string }).text : ''))
      .filter(Boolean)
      .join('\n')
  }
  text = text.replace(/\s+/g, ' ').trim()
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}

export async function runClaudeAgent(opts: RunClaudeAgentOptions): Promise<ClaudeAgentResult> {
  const { caseDir, prompt, history, onEvent, signal } = opts

  // Compose the user input: prior history + current request.
  const userText = (() => {
    const lines: string[] = []
    if (history && history.length > 0) {
      lines.push('Prior conversation:')
      lines.push('---')
      for (const m of history) {
        lines.push(`${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      }
      lines.push('---', '')
    }
    lines.push(`Request: ${prompt}`)
    lines.push('')
    lines.push(
      `Work inside the directory ${caseDir}. All file paths you Read/Write/Edit ` +
        `must be inside this directory. Do not run shell commands — the user will ` +
        `validate the case via the app's Run button after you're done. When finished, ` +
        `print a one-paragraph summary of what you generated.`,
    )
    return lines.join('\n')
  })()

  // Write the agent system prompt to a temp file. Using --append-system-prompt
  // would inline-escape it; --append-system-prompt-file is cleaner (and exists
  // in recent CLI builds). We fall back to inline if the flag is unsupported.
  const promptFile = path.join(os.tmpdir(), `ofs-agent-prompt-${Date.now()}.txt`)
  fs.writeFileSync(promptFile, AGENT_SYSTEM_PROMPT, 'utf8')

  return new Promise<ClaudeAgentResult>((resolve, reject) => {
    // Pipe the user prompt via stdin (avoids any shell-escaping pitfalls with
    // long multi-line content). The system prompt goes via --append-system-prompt
    // because there isn't a stdin-accessible variant.
    // Note: we deliberately do NOT pass --bare. --bare disables the keychain
    // and OAuth auth, which means a user who logged in via `claude /login`
    // (the most common no-API-key path) would be rejected here.
    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--verbose',
      '--add-dir', caseDir,
      '--append-system-prompt', AGENT_SYSTEM_PROMPT,
      '--permission-mode', 'acceptEdits',
      '--allowedTools', 'Read,Write,Edit,Glob,Grep',
    ]

    const child = spawn(findClaudeBin(), args, {
      cwd: caseDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    })

    child.stdin.end(userText)

    let stdoutBuf = ''
    let stderrBuf = ''
    let stepCount = 0
    let finishSummary: string | null = null
    let finalText = ''
    const toolCallToId = new Map<string, string>()
    const toolCallStarted = new Map<string, number>()
    const toolCallNames = new Map<string, string>()

    const onAbort = () => {
      try { child.kill('SIGTERM') } catch { /* ignore */ }
    }
    if (signal) {
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }

    const handleEvent = (evt: CliStreamEvent) => {
      if (evt.type === 'assistant' && evt.message?.content) {
        let stepHadAction = false
        for (const block of evt.message.content) {
          if (block.type === 'text' && block.text) {
            // Treat each text block as the "thought" for a step.
            stepCount++
            stepHadAction = true
            finalText = block.text
            onEvent({ type: 'agent-step', index: stepCount, text: block.text })
          } else if (block.type === 'tool_use') {
            const id = block.id
            const ourTool = TOOL_NAME_MAP[block.name] ?? block.name
            toolCallToId.set(id, id)
            toolCallNames.set(id, ourTool)
            toolCallStarted.set(id, Date.now())
            onEvent({
              type: 'tool-call',
              id,
              tool: ourTool,
              args: normaliseToolInput(block.name, block.input, caseDir),
            })
          }
        }
        if (!stepHadAction && evt.message.content.some((b) => b.type === 'tool_use')) {
          stepCount++
          onEvent({ type: 'agent-step', index: stepCount })
        }
      } else if (evt.type === 'user' && evt.message?.content) {
        for (const block of evt.message.content) {
          if (block.type === 'tool_result') {
            const id = block.tool_use_id
            const tool = toolCallNames.get(id) ?? 'tool'
            const startedAt = toolCallStarted.get(id) ?? Date.now()
            const ok = !block.is_error
            const preview = previewToolResult(block.content)
            onEvent({
              type: 'tool-result',
              id,
              tool,
              ok,
              preview,
              durationMs: Date.now() - startedAt,
            })
            // If this was a Write or Edit, also emit a `file` event so the
            // post-loop streamer doesn't have to be the only file source.
            if (ok && (tool === 'write_case_file' || tool === 'edit_case_file')) {
              // We don't have the path easily here without re-parsing the
              // tool_use input we recorded; skip — the post-loop scan picks it up.
            }
          }
        }
      } else if (evt.type === 'result') {
        if (typeof evt.result === 'string') {
          finishSummary = evt.result.trim() || null
          finalText = evt.result
        }
      }
    }

    const flushLines = () => {
      let idx: number
      while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, idx).trim()
        stdoutBuf = stdoutBuf.slice(idx + 1)
        if (!line) continue
        try {
          const evt = JSON.parse(line) as CliStreamEvent
          handleEvent(evt)
        } catch {
          // Non-JSON noise (rare with --bare) — ignore.
        }
      }
    }

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdoutBuf += chunk
      flushLines()
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => { stderrBuf += chunk })

    child.on('error', (err) => {
      try { fs.unlinkSync(promptFile) } catch { /* ignore */ }
      reject(new Error(`failed to spawn claude CLI: ${err.message}`))
    })

    child.on('close', (code) => {
      try { fs.unlinkSync(promptFile) } catch { /* ignore */ }
      // Drain any tail.
      if (stdoutBuf.length > 0) {
        stdoutBuf += '\n'
        flushLines()
      }

      if (signal?.aborted) {
        resolve({ finishReason: 'aborted', stepCount, finishSummary, finalText })
        return
      }
      if (code !== 0) {
        const tail = stderrBuf.split('\n').slice(-5).join('\n').trim() || stdoutBuf.slice(-200)
        reject(new Error(`claude CLI exited with code ${code}: ${tail}`))
        return
      }
      resolve({ finishReason: 'success', stepCount, finishSummary, finalText })
    })
  })
}
