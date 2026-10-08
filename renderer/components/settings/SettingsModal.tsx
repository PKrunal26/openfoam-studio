import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import * as api from '@/lib/api'
import { useDialogFocus } from '@/hooks/useDialogFocus'
import { Select } from '@/components/ui/select'

interface Props {
  open: boolean
  onClose: () => void
}

const CUSTOM_MODEL = '__custom__'

const PROVIDER_HINTS: Record<string, string> = {
  'codex-cli': 'Uses your local Codex login. No API key needed here.',
  'claude-cli': 'Uses your local Claude Code login. No key needed here.',
  anthropic: 'Get a key at console.anthropic.com. Stored locally only.',
  openai: 'Get a key at platform.openai.com. Stored locally only.',
  google: 'Get a key at aistudio.google.com. Stored locally only.',
  'openai-compatible':
    'Any OpenAI-compatible endpoint: Ollama, LM Studio, OpenRouter, Groq… Key optional for local servers.',
}

export function SettingsModal({ open, onClose }: Props) {
  const [settings, setSettings] = useState<api.Settings | null>(null)
  const [provider, setProvider] = useState<api.Settings['provider']>('codex-cli')
  const [model, setModel] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [customBaseURL, setCustomBaseURL] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogFocus(dialogRef, open, onClose)
  const [connection, setConnection] = useState<{ ok: boolean; message: string } | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const operation = useRef(0)
  const testAbort = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setError(null)
    setConnection(null)
    api
      .getSettings()
      .then((s) => {
        if (cancelled) return
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
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)) })
    return () => { cancelled = true }
  }, [open])

  // Focus/Escape are owned by the dialog hook; close clears the saved flash.
  useEffect(() => {
    operation.current++
    testAbort.current?.abort()
    setSaving(false)
    if (!open) { setSavedFlash(false); return }
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current)
    }
  }, [open])

  if (!open) return null

  const providerInfo = settings?.providers.find((p) => p.id === provider)
  const modelOptions = providerInfo?.models ?? []
  const usesModelDropdown = modelOptions.length > 0
  const isCustomModel = usesModelDropdown && model === CUSTOM_MODEL
  const requiresKey = provider !== 'codex-cli' && provider !== 'claude-cli' && provider !== 'openai-compatible'
  const acceptsKey = provider !== 'codex-cli' && provider !== 'claude-cli'
  const hasKey = settings?.hasKeys?.[provider] ?? false

  const effectiveModel = (isCustomModel ? customModel : model).trim()

  const onSave = async (test = false) => {
    if (saving) return
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
    setConnection(null)
    const token = ++operation.current
    try {
      await api.updateSettings({
        provider,
        model: effectiveModel || undefined,
        apiKey: apiKey || undefined,
        customBaseURL: provider === 'openai-compatible' ? customBaseURL : '',
      })
      if (token !== operation.current) return
      setSavedFlash(true)
      if (flashTimer.current) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setSavedFlash(false), 1500)
      // Refresh display state without revealing key
      const fresh = await api.getSettings()
      if (token !== operation.current) return
      setSettings(fresh)
      setApiKey('')
      if (test) {
        const controller = new AbortController()
        testAbort.current = controller
        const result = await api.testSettings(controller.signal)
        if (token === operation.current) setConnection(result)
      }
    } catch (err) {
      if (token === operation.current) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (token === operation.current) { setSaving(false); testAbort.current = null }
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
        ref={dialogRef}
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

        <div className="grid max-h-[70vh] gap-4 overflow-y-auto px-4 py-4">
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
              disabled={saving}
              title="AI provider"
              value={provider}
              onChange={(v) => {
                const nextProvider = v as api.Settings['provider']
                const nextInfo = settings?.providers.find((p) => p.id === nextProvider)
                setProvider(nextProvider)
                setModel(nextInfo?.defaultModel ?? '')
                setCustomModel('')
                setApiKey('')
                setError(null)
                setConnection(null)
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
              <Select disabled={saving} title="AI model" value={model} onChange={(value) => { setModel(value); setConnection(null) }}>
                {modelOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
                <option value={CUSTOM_MODEL}>Custom model ID…</option>
              </Select>
            ) : (
              <input
                disabled={saving}
                value={model}
                onChange={(e) => { setModel(e.target.value); setConnection(null) } }
                placeholder={providerInfo?.defaultModel || 'e.g. llama3.1:70b'}
                className="h-8 rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            )}
            {isCustomModel && (
              <input
                disabled={saving}
                autoFocus
                aria-label="Custom model ID"
                value={customModel}
                onChange={(e) => { setCustomModel(e.target.value); setConnection(null) } }
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
                disabled={saving}
                type="password"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setConnection(null) } }
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
                disabled={saving}
                value={customBaseURL}
                onChange={(e) => { setCustomBaseURL(e.target.value); setConnection(null) } }
                placeholder="http://localhost:11434/v1"
                className="h-8 rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
          )}

          <p className="text-[11px] text-muted-foreground">{PROVIDER_HINTS[provider]}</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">Your prompts and relevant case file contents are sent to the selected AI service. API keys stay in local settings. A local compatible endpoint sends data to the URL you configure. Saving a configuration does not verify access. The connection test sends a tiny synthetic prompt and may incur a small provider charge.</p>
          {provider === 'openai-compatible' && <p className="text-[11px] text-amber-500">Compatible endpoint mode supports bounded cavity generation. Questions and refinements depend on endpoint capabilities; review the resulting files.</p>}
          {hasKey && <button disabled={saving} className="justify-self-start rounded border px-2 py-1 text-xs" onClick={async () => { setSaving(true); setError(null); try { await api.updateSettings({ removeApiKeys: [provider] }); setSettings(await api.getSettings()); setConnection(null) } catch (err) { setError(String(err)) } finally { setSaving(false) } }}>Remove stored key</button>}
          {connection && <p role="status" className={connection.ok ? 'text-xs text-emerald-500' : 'text-xs text-destructive'}>{connection.message}</p>}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <button disabled={saving} onClick={() => void onSave(true)} className="h-8 rounded-md border px-3 text-xs disabled:opacity-50">Save and test connection</button>
          {savedFlash && <span className="text-xs text-emerald-500">Saved</span>}
          <button
            onClick={onClose}
            className="h-8 rounded-md border px-3 text-xs hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={() => void onSave()}
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
