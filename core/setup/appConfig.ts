import fs from 'fs'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'

export type LLMProvider =
  | 'codex-cli'
  | 'claude-cli'
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'openai-compatible'

export interface ProviderKeys {
  anthropic?: string
  openai?: string
  google?: string
  'openai-compatible'?: string
}

export interface AppConfig {
  /** @deprecated — kept for migration from pre-BYOK installs; mirrors apiKeys.anthropic */
  anthropicApiKey?: string
  llmProvider?: LLMProvider
  llmModel?: string
  apiKeys?: ProviderKeys
  /** Prevent an explicitly removed key from reappearing through inherited env. */
  removedApiKeys?: Array<keyof ProviderKeys>
  /** Only used when llmProvider === 'openai-compatible' (OpenRouter, Groq, Together, Ollama, LM Studio, …) */
  customBaseURL?: string
}

export interface ModelOption {
  id: string
  label: string
}

export const DEFAULT_MODEL: Record<LLMProvider, string> = {
  'codex-cli': 'gpt-6.1-sol',
  // The claude CLI resolves aliases (sonnet/opus/haiku) to the current best
  // build of that tier, so we never ship a stale pinned ID for it.
  'claude-cli': 'sonnet',
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-5.2',
  google: 'gemini-3.8-flash',
  'openai-compatible': '',
}

export const MODEL_OPTIONS: Partial<Record<LLMProvider, ModelOption[]>> = {
  'codex-cli': [{ id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol (Codex login)' }],
  'claude-cli': [
    { id: 'sonnet', label: 'Sonnet (recommended)' },
    { id: 'opus', label: 'Opus (most capable)' },
    { id: 'haiku', label: 'Haiku (fastest)' },
  ],
  anthropic: [
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (account access required)' },
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (account access required)' },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
    { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  ],
  openai: [
    { id: 'gpt-5.2', label: 'GPT-5.2' },
    { id: 'gpt-5.1', label: 'GPT-5.1' },
    { id: 'gpt-5', label: 'GPT-5' },
    { id: 'gpt-5-mini', label: 'GPT-5 mini' },
    { id: 'gpt-4.1', label: 'GPT-4.1' },
  ],
  google: [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)' },
  ],
}

export const PROVIDER_LABELS: Record<LLMProvider, string> = {
  'codex-cli': 'Codex CLI (uses codex login, no key)',
  'claude-cli': 'Claude Code CLI (uses claude auth login, no key)',
  anthropic: 'Anthropic (direct API key)',
  openai: 'OpenAI',
  google: 'Google (Gemini)',
  'openai-compatible': 'Custom OpenAI-compatible endpoint',
}

function defaultConfigDir(): string {
  const override = process.env['OFS_CONFIG_DIR']
  if (override) return override
  const home = os.homedir()
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'OpenFOAM Studio')
  }
  if (process.platform === 'win32') {
    return path.join(process.env['APPDATA'] || path.join(home, 'AppData', 'Roaming'), 'OpenFOAM Studio')
  }
  return path.join(process.env['XDG_CONFIG_HOME'] || path.join(home, '.config'), 'openfoam-studio')
}

export function getConfigPath(): string {
  return path.join(defaultConfigDir(), 'config.json')
}

export function readConfig(): AppConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8')) as AppConfig
    // Migrate legacy single-key shape → apiKeys.anthropic
    if (typeof raw.anthropicApiKey === 'string' && raw.anthropicApiKey && !raw.apiKeys?.anthropic) {
      raw.apiKeys = { ...(raw.apiKeys ?? {}), anthropic: raw.anthropicApiKey }
    }
    if (credentialStore) raw.apiKeys = { ...raw.apiKeys, ...credentialStore.keys }
    return raw
  } catch {
    return credentialStore ? { apiKeys: { ...credentialStore.keys } } : {}
  }
}

interface CredentialStore {
  keys: ProviderKeys
  save: (keys: ProviderKeys) => Promise<void>
}
let credentialStore: CredentialStore | undefined
export function setCredentialStore(store: CredentialStore | undefined): void { credentialStore = store }

function atomicWriteConfig(next: AppConfig): void {
  const filePath = getConfigPath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  const temporary = path.join(path.dirname(filePath), `.config-${randomUUID()}.tmp`)
  const descriptor = fs.openSync(temporary, 'wx', 0o600)
  try {
    try {
      fs.writeFileSync(descriptor, `${JSON.stringify(next, null, 2)}\n`)
      fs.fsyncSync(descriptor)
    } finally { fs.closeSync(descriptor) }
    fs.renameSync(temporary, filePath)
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary) }
}

export async function writeConfig(next: AppConfig): Promise<void> {
  const stored = { ...next }
  if (credentialStore) {
    const keys = { ...next.apiKeys }
    if (next.anthropicApiKey && !keys.anthropic) keys.anthropic = next.anthropicApiKey
    const previous = credentialStore.keys
    await credentialStore.save(keys)
    delete stored.apiKeys
    delete stored.anthropicApiKey
    try { atomicWriteConfig(stored) }
    catch (error) { await credentialStore.save(previous); throw error }
    credentialStore.keys = keys
    return
  }
  atomicWriteConfig(stored)
}

/** Explicit removal masks config AND live inherited environment values. */
export function removeProviderKeys(cfg: AppConfig, providers: Array<keyof ProviderKeys>): AppConfig {
  const next = { ...cfg, apiKeys: { ...cfg.apiKeys }, removedApiKeys: [...new Set([...(cfg.removedApiKeys ?? []), ...providers])] }
  const envKeys: Record<keyof ProviderKeys, string[]> = {
    anthropic: ['ANTHROPIC_API_KEY'], openai: ['OPENAI_API_KEY'],
    google: ['GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'], 'openai-compatible': [],
  }
  for (const provider of providers) {
    delete next.apiKeys[provider]
    if (provider === 'anthropic') delete next.anthropicApiKey
    for (const variable of envKeys[provider]) delete process.env[variable]
  }
  return next
}

/** Electron alone handles OS encryption; the headless core communicates via Node IPC. */
export async function initializeCredentialStore(): Promise<void> {
  if (process.env['OFS_CREDENTIAL_IPC'] !== '1') return
  if (!process.send) throw new Error('Credential broker is unavailable')
  const request = (action: 'load' | 'save', keys?: ProviderKeys): Promise<ProviderKeys> => new Promise((resolve, reject) => {
    const id = randomUUID()
    const onMessage = (message: unknown) => {
      if (!message || typeof message !== 'object') return
      const reply = message as { type?: string; id?: string; keys?: ProviderKeys; error?: string }
      if (reply.type !== 'ofs-credentials-reply' || reply.id !== id) return
      clearTimeout(timer)
      process.off('message', onMessage)
      if (reply.error) reject(new Error(reply.error))
      else resolve(reply.keys ?? {})
    }
    const timer = setTimeout(() => { process.off('message', onMessage); reject(new Error('Credential broker timed out')) }, 5_000)
    process.on('message', onMessage)
    process.send?.({ type: 'ofs-credentials', id, action, ...(keys ? { keys } : {}) })
  })
  const keys = await request('load')
  const legacy = readConfig()
  setCredentialStore({ keys, save: async values => { await request('save', values) } })
  if (legacy.apiKeys || legacy.anthropicApiKey) await writeConfig({ ...legacy, apiKeys: { ...legacy.apiKeys, ...keys } })
}

// CLI authentication must be checked with checkClaudeAuthentication(), never inferred from files.

/** Resolve the effective provider, preferring explicit config, else env, else 'codex-cli'. */
export function getActiveProvider(cfg: AppConfig = readConfig()): LLMProvider {
  if (cfg.llmProvider) return cfg.llmProvider
  // Pre-BYOK installs with an Anthropic key default to direct Anthropic.
  if (cfg.apiKeys?.anthropic || cfg.anthropicApiKey || process.env['ANTHROPIC_API_KEY']) {
    return 'anthropic'
  }
  return 'codex-cli'
}

export function getActiveModel(cfg: AppConfig = readConfig()): string {
  const provider = getActiveProvider(cfg)
  // Any non-empty configured model wins, including IDs not in MODEL_OPTIONS —
  // the dropdown lists are suggestions, not an allowlist, so users can point
  // at models released after this build.
  const configured = cfg.llmModel?.trim()
  return configured || DEFAULT_MODEL[provider]
}

export function getProviderKey(provider: LLMProvider, cfg: AppConfig = readConfig()): string | undefined {
  if (provider === 'claude-cli' || provider === 'codex-cli') return undefined
  if (cfg.removedApiKeys?.includes(provider)) return undefined
  if (provider === 'anthropic') {
    return cfg.apiKeys?.anthropic?.trim()
      || cfg.anthropicApiKey?.trim()
      || process.env['ANTHROPIC_API_KEY']?.trim()
      || undefined
  }
  if (provider === 'openai') {
    return cfg.apiKeys?.openai?.trim() || process.env['OPENAI_API_KEY']?.trim() || undefined
  }
  if (provider === 'google') {
    return cfg.apiKeys?.google?.trim()
      || process.env['GOOGLE_GENERATIVE_AI_API_KEY']?.trim()
      || process.env['GOOGLE_API_KEY']?.trim()
      || undefined
  }
  if (provider === 'openai-compatible') {
    return cfg.apiKeys?.['openai-compatible']?.trim() || undefined
  }
  return undefined
}

/** True if the currently-selected provider has what it needs to run. */
export function hasLLMAuth(cfg: AppConfig = readConfig()): boolean {
  const provider = getActiveProvider(cfg)
  if (provider === 'claude-cli' || provider === 'codex-cli') return false // Real CLI status is checked asynchronously by health.
  if (provider === 'openai-compatible') {
    // Key is optional for purely-local endpoints (Ollama); baseURL is mandatory.
    try {
      const endpoint = new URL(cfg.customBaseURL ?? '')
      return ['http:', 'https:'].includes(endpoint.protocol) && !!getActiveModel(cfg) && !endpoint.username && !endpoint.password
    } catch { return false }
  }
  return !!getProviderKey(provider, cfg)
}

/** Legacy compatibility alias for callers that only check configuration. */
export function hasApiKey(): boolean {
  return hasLLMAuth()
}

/** Populate process.env for legacy code paths (claude CLI, old callers). */
export function loadApiKeyIntoEnv(): void {
  const cfg = readConfig()
  if (cfg.removedApiKeys?.includes('anthropic')) { delete process.env['ANTHROPIC_API_KEY']; return }
  if (process.env['ANTHROPIC_API_KEY'] && process.env['ANTHROPIC_API_KEY']!.trim()) return
  const key = cfg.apiKeys?.anthropic?.trim() || cfg.anthropicApiKey?.trim()
  if (key) process.env['ANTHROPIC_API_KEY'] = key
}
