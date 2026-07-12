import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import * as api from '@/lib/api'
import { Select } from '@/components/ui/select'

interface Props {
  open: boolean
  onClose: () => void
}

const CUSTOM_MODEL = '__custom__'

const PROVIDER_HINTS: Record<string, string> = {
  'claude-cli': 'Uses your local Claude Code login. No key needed here.',
  anthropic: 'Get a key at console.anthropic.com. Stored locally only.',
  openai: 'Get a key at platform.openai.com. Stored locally only.',
  google: 'Get a key at aistudio.google.com. Stored locally only.',
  'openai-compatible':
    'Any OpenAI-compatible endpoint: Ollama, LM Studio, OpenRouter, Groq… Key optional for local servers.',
}

export function SettingsModal({ open, onClose }: Props) {
  const [settings, setSettings] = useState<api.Settings | null>(null)
  const [provider, setProvider] = useState<api.Settings['provider']>('claude-cli')
  const [model, setModel] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [customBaseURL, setCustomBaseURL] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    api
      .getSettings()
      .then((s) => {
        setSettings(s)
        setProvider(s.provider)
        const info = s.providers.find((p) => p.id === s.provider)
        const options = info?.models ?? []
        const inList = options.some((m) => m.id === s.model)
        // Model IDs outside the suggestion list are valid (user-typed) —
        // surface them through the Custom row instead of silently swapping.
        setModel(options.length === 0 || inList ? s.model ?? '' : CUSTOM_MODEL)
        setCustomModel(inList ? '' : s.model ?? '')
        setCustomBaseURL(s.customBaseURL ?? '')
        setApiKey('')
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [open])

  // Esc closes; cleanup also cancels a pending saved-flash timer.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (flashTimer.current) clearTimeout(flashTimer.current)
    }
  }, [open, onClose])

  if (!open) return null

  const providerInfo = settings?.providers.find((p) => p.id === provider)
  const modelOptions = providerInfo?.models ?? []
  const usesModelDropdown = modelOptions.length > 0
  const isCustomModel = usesModelDropdown && model === CUSTOM_MODEL
  const requiresKey = provider !== 'claude-cli' && provider !== 'openai-compatible'
  const acceptsKey = provider !== 'claude-cli'
  const hasKey = settings?.hasKeys?.[provider] ?? false

  const effectiveModel = (isCustomModel ? customModel : model).trim()

  const onSave = async () => {
    setError(null)
    if (requiresKey && !hasKey && !apiKey.trim()) {
      setError(`${providerInfo?.label ?? provider} needs an API key before it can generate anything.`)
      return
    }
    if (provider === 'openai-compatible' && !customBaseURL.trim()) {
      setError('Enter the base URL of your OpenAI-compatible endpoint (e.g. http://localhost:11434/v1).')
      return
    }
    if (isCustomModel && !effectiveModel) {
      setError('Enter a model ID, or pick one from the list.')
      return
    }
    setSaving(true)
    try {
      await api.updateSettings({
        provider,
        model: effectiveModel || undefined,
        apiKey: apiKey || undefined,
        customBaseURL: provider === 'openai-compatible' ? customBaseURL : '',
      })
      setSavedFlash(true)
      if (flashTimer.current) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setSavedFlash(false), 1500)
      // Refresh display state without revealing key
      const fresh = await api.getSettings()
      setSettings(fresh)
      setApiKey('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 py-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border bg-card text-card-foreground shadow-xl"
      >
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-medium">Settings</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid gap-4 px-4 py-4">
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <label className="grid gap-1">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Provider
            </span>
            <Select
              value={provider}
              onChange={(v) => {
                const nextProvider = v as api.Settings['provider']
                const nextInfo = settings?.providers.find((p) => p.id === nextProvider)
                setProvider(nextProvider)
                setModel(nextInfo?.defaultModel ?? '')
                setCustomModel('')
                setApiKey('')
                setError(null)
              }}
            >
              {(settings?.providers ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </label>

          <label className="grid gap-1">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Model
            </span>
            {usesModelDropdown ? (
              <Select value={model} onChange={setModel}>
                {modelOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
                <option value={CUSTOM_MODEL}>Custom model ID…</option>
              </Select>
            ) : (
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={providerInfo?.defaultModel || 'e.g. llama3.1:70b'}
                className="h-8 rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            )}
            {isCustomModel && (
              <input
                autoFocus
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="Exact model ID, e.g. claude-sonnet-5"
                className="mt-1 h-8 rounded-md border bg-background px-2.5 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
              />
            )}
          </label>

          {acceptsKey && (
            <label className="grid gap-1">
              <span className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
                <span>API key{provider === 'openai-compatible' ? ' (optional)' : ''}</span>
                {hasKey && <span className="lowercase tracking-normal text-emerald-500">stored</span>}
              </span>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={hasKey ? '••••••••  (leave empty to keep existing)' : 'Paste your key…'}
                autoComplete="off"
                className="h-8 rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
          )}

          {provider === 'openai-compatible' && (
            <label className="grid gap-1">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Base URL
              </span>
              <input
                value={customBaseURL}
                onChange={(e) => setCustomBaseURL(e.target.value)}
                placeholder="http://localhost:11434/v1"
                className="h-8 rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
          )}

          <p className="text-[11px] text-muted-foreground">{PROVIDER_HINTS[provider]}</p>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t px-4 py-3">
          {savedFlash && <span className="text-xs text-emerald-500">Saved</span>}
          <button
            onClick={onClose}
            className="h-8 rounded-md border px-3 text-xs hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  )
}
