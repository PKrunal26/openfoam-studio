import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { runCodex } from './codex-runner.js'
import { diagnosisContext } from './diagnoseCase.js'
import { applyFixes, FileFixSchema } from './applyFix.js'
import { getActiveModel, readConfig } from '../setup/appConfig.js'
import { assertCaseExecutionPolicy } from '../run/casePolicy.js'
import { AGENT_SYSTEM_PROMPT } from './prompts/agent-system-prompt.js'
import type { RunClaudeAgentOptions, ClaudeAgentResult } from './ClaudeAgentRunner.js'

const RESPONSE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['summary', 'fix'], properties: {
    summary: { type: 'string' }, fix: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['file', 'description', 'oldValue', 'newValue'], properties: {
        file: { type: 'string' }, description: { type: 'string' }, oldValue: { type: 'string' }, newValue: { type: 'string' },
      },
    } },
  },
}
const ResponseSchema = z.object({ summary: z.string().min(1).max(64 * 1024), fix: z.array(FileFixSchema).max(50) }).strict()
export type RunCodexAgentOptions = RunClaudeAgentOptions
export type CodexAgentResult = ClaudeAgentResult

/** The model sees bounded inputs and proposes a typed patch; it has no file or execution tools. */
export async function runCodexAgent(options: RunCodexAgentOptions): Promise<CodexAgentResult> {
  const signal = AbortSignal.any([options.signal ?? new AbortController().signal, AbortSignal.timeout(options.timeoutMs ?? 10 * 60_000)])
  signal.throwIfAborted()
  assertCaseExecutionPolicy(options.caseDir)
  const files = diagnosisContext(options.caseDir)
  const fileBlocks = Object.entries(files).map(([name, content]) => `=== ${name} ===\n${content}`).join('\n\n')
  const history = options.history?.slice(-20).map(message => `${message.role}: ${message.content}`).join('\n') ?? ''
  const prompt = `Prior conversation:\n${history.slice(-64 * 1024)}\n\nCurrent input files (omitted files are unknown):\n${fileBlocks}\n\nRequest: ${options.prompt}\n\n` +
    `Return a summary and fix array. ${options.readOnly ? 'This is an explanation-only request: fix MUST be empty.' :
      'Propose only requested case changes. Existing files require an exact unique oldValue; new absent input files use empty oldValue and complete content as newValue.'}\n` +
    'All file paths must be case-relative under 0/, constant/, system/. Never invent missing physical inputs: if material physics is ambiguous, return no fixes and targeted questions. Do not claim that a run or validation occurred.'
  options.onEvent({ type: 'agent-step', index: 1, text: 'Codex is preparing a structured case proposal from the current inputs.' })
  try {
    const output = await runCodex(AGENT_SYSTEM_PROMPT, prompt, undefined, getActiveModel(readConfig()) || 'gpt-6.1-sol', { signal, schema: RESPONSE_SCHEMA })
    signal.throwIfAborted()
    const parsed = ResponseSchema.parse(JSON.parse(output))
    if (options.readOnly && parsed.fix.length) throw new Error('Codex proposed changes during an explanation-only request')
    const fixes = parsed.fix.map(proposed => {
      const file = proposed.file.replace(/\\/g, '/')
      const original = files[file]
      if (original === undefined && (proposed.oldValue !== '' || fs.existsSync(path.join(options.caseDir, file)))) throw new Error(`Codex proposed a change without full file context: ${file}`)
      if (original !== undefined && (!proposed.oldValue || original.split(proposed.oldValue).length !== 2)) throw new Error(`Codex patch requires one exact existing match: ${file}`)
      return { ...proposed, file, ...(original === undefined ? {} : { expectedContent: original }) }
    })
    if (fixes.length) {
      signal.throwIfAborted()
      const applied = applyFixes(options.caseDir, fixes)
      if (!applied.ok) throw new Error(`Codex patch rejected: ${applied.message}`)
      for (const [index, fix] of fixes.entries()) {
        const id = `codex_patch_${index}`
        options.onEvent({ type: 'tool-call', id, tool: 'edit_case_file', args: { path: fix.file } })
        options.onEvent({ type: 'tool-result', id, tool: 'edit_case_file', ok: true, preview: fix.description, durationMs: 0 })
        options.onEvent({ type: 'file', path: fix.file, size: fs.statSync(path.join(options.caseDir, fix.file)).size })
      }
    }
    options.onEvent({ type: 'finish', summary: parsed.summary })
    return { finishReason: 'success', stepCount: 1, finishSummary: parsed.summary, finalText: parsed.summary }
  } catch (error) {
    if (signal.aborted) return { finishReason: 'aborted', stepCount: 1, finishSummary: null, finalText: '' }
    throw error
  }
}
