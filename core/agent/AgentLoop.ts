/**
 * AgentLoop — multi-turn tool-calling generation loop for OpenFOAM cases.
 *
 * Replaces the single-pass FileGenerator: instead of asking the LLM for one
 * JSON dump of all files, we give it a tool kit (read/write case files,
 * search/read docs, run blockMesh/checkMesh/foamRun) and let it iterate
 * — the same way Claude Code in VS Code feels smarter.
 *
 * The loop is the AI SDK's built-in tool-call loop (`streamText` + `stopWhen`);
 * we don't reimplement iteration. Each step's tool calls / results / text are
 * relayed via `onEvent` so the renderer can show progress like a real agent.
 */

import { streamText, stepCountIs, hasToolCall } from 'ai'
import type Docker from 'dockerode'

import { resolveSdkModel } from './llm.js'
import {
  getActiveModel,
  getActiveProvider,
  readConfig,
  type LLMProvider,
} from '../setup/appConfig.js'
import { AGENT_SYSTEM_PROMPT } from './prompts/agent-system-prompt.js'
import { makeTools, type AgentEvent } from './tools.js'
import type { Message } from './types.js'

export type { AgentEvent }

export interface RunAgentLoopOptions {
  caseDir: string
  prompt: string
  /** Prior conversation history (refinement turns). */
  history?: Message[]
  /** Docker handle for run_command. Optional in tests. */
  docker?: Docker | null
  /** Progress sink — called with every step / tool / file event. */
  onEvent: (e: AgentEvent) => void
  /** Hard cap on agent steps. Default 16. */
  maxSteps?: number
  /** Optional pin (overrides BYOK config — mainly for tests). */
  provider?: LLMProvider
  model?: string
  /** Abort signal from the HTTP request. */
  signal?: AbortSignal
}

export interface AgentLoopResult {
  finishReason: string
  stepCount: number
  finishSummary: string | null
  /** Final assistant text (last step's text), if any. */
  finalText: string
  provider: LLMProvider
  model: string
}

/**
 * Run the agent loop until the model calls `finish`, the step cap is hit, or
 * the LLM stops on its own. Returns a summary; the actual side effects
 * (files written, commands run) have already happened via tool execute paths.
 */
export async function runAgentLoop(opts: RunAgentLoopOptions): Promise<AgentLoopResult> {
  const cfg = readConfig()
  const provider = opts.provider ?? getActiveProvider(cfg)
  const model = opts.model ?? getActiveModel(cfg)

  if (provider === 'claude-cli') {
    throw new Error(
      'AgentLoop does not support the claude-cli provider directly — wire the headless ' +
        'Claude Code branch in the server instead.',
    )
  }

  const languageModel = resolveSdkModel(provider, model, cfg)

  let finishSummary: string | null = null
  const tools = makeTools({
    caseDir: opts.caseDir,
    docker: opts.docker ?? null,
    onEvent: opts.onEvent,
    onFinish: (s) => {
      finishSummary = s
    },
  })

  // Build the initial user message. For refinement turns we inline prior chat
  // so the model has the full thread without us having to round-trip the whole
  // tool call history (the AI SDK only stores the in-loop history).
  const userText = (() => {
    if (!opts.history || opts.history.length === 0) return opts.prompt
    const historyText = opts.history
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n')
    return [
      'Prior conversation:',
      '---',
      historyText,
      '---',
      '',
      `New request: ${opts.prompt}`,
    ].join('\n')
  })()

  let stepIndex = 0
  let finalText = ''
  let streamError: string | null = null

  const result = streamText({
    model: languageModel,
    system: AGENT_SYSTEM_PROMPT,
    prompt: userText,
    tools,
    toolChoice: 'required',
    stopWhen: [stepCountIs(opts.maxSteps ?? 16), hasToolCall('finish')],
    ...(opts.signal ? { abortSignal: opts.signal } : {}),
    onStepFinish: ({ text }) => {
      stepIndex++
      if (text) finalText = text
      const evt: { type: 'agent-step'; index: number; text?: string } = { type: 'agent-step', index: stepIndex }
      if (text) evt.text = text
      opts.onEvent(evt)
    },
    onError: ({ error }) => {
      const message = error instanceof Error ? error.message : String(error)
      streamError = message
      // Re-throw via the event channel so the server can map it to an SSE error.
      opts.onEvent({
        type: 'tool-result',
        id: 'agent_error',
        tool: 'agent',
        ok: false,
        preview: message,
        durationMs: 0,
      })
    },
  })

  // Drain the stream so all tool execute callbacks fire before we resolve.
  // We don't pipe text deltas to the client here — per-step text is emitted
  // by onStepFinish, which gives one clean event per step instead of token spam.
  for await (const _delta of result.textStream) {
    // intentionally empty — drain
  }

  if (streamError) {
    throw new Error(streamError)
  }

  const finalFinishReason = await result.finishReason
  return {
    finishReason: finalFinishReason,
    stepCount: stepIndex,
    finishSummary,
    finalText,
    provider,
    model,
  }
}
