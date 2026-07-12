import fs from 'fs'
import os from 'os'
import path from 'path'

export type LLMProvider =
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
  /** Only used when llmProvider === 'openai-compatible' (OpenRouter, Groq, Together, Ollama, LM Studio, …) */
  customBaseURL?: string
}

export interface ModelOption {
  id: string
  label: string
}

export const DEFAULT_MODEL: Record<LLMProvider, string> = {
  // The claude CLI resolves aliases (sonnet/opus/haiku) to the current best
  // build of that tier, so we never ship a stale pinned ID for it.
  'claude-cli': 'sonnet',
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-5.2',
  google: 'gemini-2.5-pro',
  'openai-compatible': '',
}

export const MODEL_OPTIONS: Partial<Record<LLMProvider, ModelOption[]>> = {
  'claude-cli': [
    { id: 'sonnet', label: 'Sonnet (recommended)' },
    { id: 'opus', label: 'Opus (most capable)' },
    { id: 'haiku', label: 'Haiku (fastest)' },
  ],
  anthropic: [
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
    { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
  ],
}

export const PROVIDER_LABELS: Record<LLMProvider, string> = {
  'claude-cli': 'Claude Code CLI (uses claude login, no key)',
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
    if (raw.anthropicApiKey && !raw.apiKeys?.anthropic) {
      raw.apiKeys = { ...(raw.apiKeys ?? {}), anthropic: raw.anthropicApiKey }
    }
    return raw
  } catch {
    return {}
  }
}

export function writeConfig(next: AppConfig): void {
  const filePath = getConfigPath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), { mode: 0o600 })
}

export function hasClaudeCredentials(): boolean {
  const credFile = path.join(os.homedir(), '.claude.json')
  return fs.existsSync(credFile)
}

/** Resolve the effective provider, preferring explicit config, else env, else 'claude-cli'. */
export function getActiveProvider(cfg: AppConfig = readConfig()): LLMProvider {
  if (cfg.llmProvider) return cfg.llmProvider
  // Pre-BYOK installs with an Anthropic key default to direct Anthropic.
  if (cfg.apiKeys?.anthropic || cfg.anthropicApiKey || process.env['ANTHROPIC_API_KEY']) {
    return 'anthropic'
  }
  return 'claude-cli'
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
  if (provider === 'claude-cli') return undefined
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
  if (provider === 'claude-cli') return hasClaudeCredentials() || !!process.env['ANTHROPIC_API_KEY']
  if (provider === 'openai-compatible') {
    // Key is optional for purely-local endpoints (Ollama); baseURL is mandatory.
    return !!(cfg.customBaseURL && cfg.customBaseURL.trim())
  }
  return !!getProviderKey(provider, cfg)
}

/** Legacy alias — still used by health.ts. */
export function hasApiKey(): boolean {
  return hasLLMAuth()
}

/** Populate process.env for legacy code paths (claude CLI, old callers). */
export function loadApiKeyIntoEnv(): void {
  if (process.env['ANTHROPIC_API_KEY'] && process.env['ANTHROPIC_API_KEY']!.trim()) return
  const cfg = readConfig()
  const key = cfg.apiKeys?.anthropic?.trim() || cfg.anthropicApiKey?.trim()
  if (key) process.env['ANTHROPIC_API_KEY'] = key
}
