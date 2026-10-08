import { spawn } from 'child_process'
import { generateText } from 'ai'
import { resolveCodexBin } from '../agent/codex-runner.js'
import { resolveClaudeBin } from '../agent/claude-runner.js'
import { generateOnce, resolveSdkModel } from '../agent/llm.js'
import { getActiveModel, getActiveProvider, readConfig, type AppConfig } from './appConfig.js'

/** Read-only CLI auth probe. File existence is deliberately not authentication. */
export async function checkClaudeAuthentication(signal?: AbortSignal, timeoutMs = 5_000): Promise<boolean> {
  const binary = resolveClaudeBin()
  if (!binary || signal?.aborted) return false
  return new Promise(resolve => {
    const child = spawn(binary, ['auth', 'status'], { stdio: ['ignore', 'pipe', 'ignore'], env: process.env })
    let output = ''
    let done = false
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
      resolve(ok)
    }
    const cancel = () => { child.kill('SIGKILL'); finish(false) }
    const timer = setTimeout(cancel, timeoutMs)
    signal?.addEventListener('abort', cancel, { once: true })
    child.stdout.on('data', chunk => {
      output += chunk.toString()
      if (output.length > 16_384) cancel()
    })
    child.on('error', () => finish(false))
    child.on('close', code => {
      try {
        const status = JSON.parse(output) as { loggedIn?: boolean; authMethod?: string }
        finish(code === 0 && (status.loggedIn === true || (!!status.authMethod && status.authMethod !== 'none')))
      } catch { finish(false) }
    })
  })
}

/** Read-only Codex login probe, bounded and without inspecting credential files. */
export async function checkCodexAuthentication(signal?: AbortSignal, timeoutMs = 5_000): Promise<boolean> {
  const binary = resolveCodexBin()
  if (!binary || signal?.aborted) return false
  return new Promise(resolve => {
    const child = spawn(binary, ['login', 'status'], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env, shell: false })
    let output = ''
    let done = false
    const finish = (ok: boolean) => {
      if (done) return
      done = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel); resolve(ok)
    }
    const cancel = () => { child.kill('SIGKILL'); finish(false) }
    const timer = setTimeout(cancel, timeoutMs)
    signal?.addEventListener('abort', cancel, { once: true })
    const collect = (chunk: Buffer) => { output += chunk.toString(); if (output.length > 16_384) cancel() }
    child.stdout.on('data', collect); child.stderr.on('data', collect)
    child.on('error', () => finish(false))
    child.on('close', code => finish(code === 0 && /logged in/i.test(output)))
  })
}

/** Explicitly invoked in Settings; sends only a synthetic prompt and can incur a small provider charge. */
export async function testProviderConnection(
  cfg: AppConfig = readConfig(),
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<{ ok: boolean; provider: string; model: string; message: string }> {
  const provider = getActiveProvider(cfg)
  const model = getActiveModel(cfg)
  const signal = AbortSignal.any([AbortSignal.timeout(options.timeoutMs ?? 20_000), ...(options.signal ? [options.signal] : [])])
  try {
    if (provider === 'claude-cli' || provider === 'codex-cli') {
      const response = await generateOnce('Reply only with OK. Do not use tools.', 'Reply with OK.', { provider, model, signal, timeoutMs: options.timeoutMs ?? 20_000, maxOutputTokens: 32 })
      if (!response.text.trim()) throw new Error('Empty CLI response')
      return { ok: true, provider, model, message: `${provider === 'codex-cli' ? 'Codex' : 'Claude'} CLI and selected model responded. This test does not certify tool use or CFD accuracy.` }
    }
    await generateText({ model: resolveSdkModel(provider, model, cfg), prompt: 'Reply with OK.', maxOutputTokens: 32, maxRetries: 0, abortSignal: signal })
    return { ok: true, provider, model, message: 'Provider and model responded. This test does not certify tool use or CFD accuracy.' }
  } catch {
    return { ok: false, provider, model, message: signal.aborted ? 'Connection test cancelled or timed out.' : provider === 'codex-cli' ? 'Codex CLI/model request failed. Run codex login, then check model access and CLI version.' : provider === 'claude-cli' ? 'Claude CLI/model request failed. Run claude auth login, then check model access and CLI version.' : 'Provider/model request failed. Check credentials, endpoint, model access, and account quota.' }
  }
}
