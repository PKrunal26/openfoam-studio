/**
 * Unified LLM client. Dispatches to the user-selected provider via Vercel AI SDK,
 * with a fallback to the existing `claude` CLI for users who already have
 * Claude Code authenticated locally.
 *
 * All call sites (FileGenerator, claudeDiagnose) go through `generateWithLLM`
 * so the BYOK selection is the only place that knows which provider is active.
 */

import { streamText, generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import {
  getActiveModel,
  getActiveProvider,
  getProviderKey,
  readConfig,
  type AppConfig,
  type LLMProvider,
} from '../setup/appConfig.js'
import { runClaude } from './claude-runner.js'

export interface LLMCallOptions {
  /** Called with each streamed text delta. */
  onDelta?: (delta: string) => void
  /** Pinning provider/model for a single call (diagnostics, etc.). Falls back to user config. */
  provider?: LLMProvider
  model?: string
  /** Max output tokens. Providers have their own caps; we pass this through. */
  maxOutputTokens?: number
}

export interface LLMResult {
  text: string
  provider: LLMProvider
  model: string
}

/**
 * Return the text-only result from an LLM call. For providers wired through
 * Vercel AI SDK we stream tokens; for the claude CLI fallback we emit text
 * deltas as the JSON `result` comes out of the CLI.
 */
export async function generateWithLLM(
  systemPrompt: string,
  userPrompt: string,
  opts: LLMCallOptions = {},
): Promise<LLMResult> {
  const cfg = readConfig()
  const provider = opts.provider ?? getActiveProvider(cfg)
  const model = opts.model ?? getActiveModel(cfg)

  if (provider === 'claude-cli') {
    const raw = await runClaude(systemPrompt, userPrompt, opts.onDelta, model)
    // runClaude returns the envelope JSON shape — unwrap `result`
    try {
      const env = JSON.parse(raw) as { is_error?: boolean; result?: string }
      if (env.is_error) throw new Error(env.result || 'claude CLI reported an error')
      return { text: env.result ?? '', provider, model }
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error(`claude CLI returned non-JSON output:\n${raw.slice(0, 500)}`)
      }
      throw err
    }
  }

  const languageModel = resolveSdkModel(provider, model, cfg)

  const result = streamText({
    model: languageModel,
    system: systemPrompt,
    prompt: userPrompt,
    ...(opts.maxOutputTokens ? { maxOutputTokens: opts.maxOutputTokens } : {}),
  })

  if (opts.onDelta) {
    for await (const delta of result.textStream) {
      if (delta) opts.onDelta(delta)
    }
  }
  const text = await result.text
  return { text, provider, model }
}

/**
 * Resolve the active provider/model into an AI SDK `LanguageModel`. Exported
 * so the agent loop can use the same provider-resolution logic without
 * duplicating BYOK config plumbing.
 */
export function resolveSdkModel(provider: LLMProvider, model: string, cfg: AppConfig): LanguageModel {
  const key = getProviderKey(provider, cfg)

  if (provider === 'anthropic') {
    if (!key) throw new Error('Anthropic selected but no API key is configured. Add one in Settings.')
    return createAnthropic({ apiKey: key })(model)
  }

  if (provider === 'openai') {
    if (!key) throw new Error('OpenAI selected but no API key is configured. Add one in Settings.')
    return createOpenAI({ apiKey: key })(model)
  }

  if (provider === 'google') {
    if (!key) throw new Error('Google selected but no API key is configured. Add one in Settings.')
    return createGoogleGenerativeAI({ apiKey: key })(model)
  }

  if (provider === 'openai-compatible') {
    let baseURL = (cfg.customBaseURL ?? '').trim()
    if (!baseURL) {
      throw new Error('Custom OpenAI-compatible provider selected but no base URL is configured.')
    }
    if (!model) {
      throw new Error('Custom OpenAI-compatible provider selected but no model is configured.')
    }
    // LM Studio / Ollama expose /v1 — auto-append if caller forgot it
    if (!baseURL.endsWith('/v1') && !baseURL.endsWith('/v1/')) {
      baseURL = baseURL.replace(/\/$/, '') + '/v1'
    }
    const compat = createOpenAICompatible({
      name: 'custom',
      baseURL,
      ...(key ? { apiKey: key } : {}),
    })
    return compat(model)
  }

  throw new Error(`Unsupported provider: ${provider as string}`)
}

/** One-shot non-streaming variant used for short utilities (e.g. smoke tests). */
export async function generateOnce(systemPrompt: string, userPrompt: string): Promise<LLMResult> {
  const cfg = readConfig()
  const provider = getActiveProvider(cfg)
  const model = getActiveModel(cfg)
  if (provider === 'claude-cli') {
    return generateWithLLM(systemPrompt, userPrompt)
  }
  const languageModel = resolveSdkModel(provider, model, cfg)
  const { text } = await generateText({ model: languageModel, system: systemPrompt, prompt: userPrompt })
  return { text, provider, model }
}
