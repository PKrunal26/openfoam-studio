import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import * as api from '@/lib/api'

interface Props {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: Props) {
  const [settings, setSettings] = useState<api.Settings | null>(null)
  const [provider, setProvider] = useState<api.Settings['provider']>('claude-cli')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [customBaseURL, setCustomBaseURL] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    api
      .getSettings()
      .then((s) => {
        setSettings(s)
        setProvider(s.provider)
        setModel(s.model ?? '')
        setCustomBaseURL(s.customBaseURL ?? '')
        setApiKey('')
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [open])

  if (!open) return null

  const providerInfo = settings?.providers.find((p) => p.id === provider)
  const modelOptions = providerInfo?.models ?? []
  const usesModelDropdown = modelOptions.length > 0

  const onSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const selectedModel = usesModelDropdown && !modelOptions.some((m) => m.id === model)
        ? providerInfo?.defaultModel
        : model
      await api.updateSettings({
        provider,
        model: selectedModel || undefined,
        apiKey: apiKey || undefined,
        customBaseURL: provider === 'openai-compatible' ? customBaseURL : '',
      })
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
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

  const requiresKey = provider !== 'claude-cli'
  const hasKey = settings?.hasKeys?.[provider] ?? false

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 py-6"
      onClick={onClose}
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
            <select
              value={provider}
              onChange={(e) => {
                const nextProvider = e.target.value as api.Settings['provider']
                const nextInfo = settings?.providers.find((p) => p.id === nextProvider)
                setProvider(nextProvider)
                setModel(nextInfo?.defaultModel ?? '')
              }}
              className="h-8 rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            >
              {(settings?.providers ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Model
            </span>
            {usesModelDropdown ? (
              <select
                value={modelOptions.some((m) => m.id === model) ? model : providerInfo?.defaultModel ?? ''}
                onChange={(e) => setModel(e.target.value)}
                className="h-8 rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              >
                {modelOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={providerInfo?.defaultModel ?? ''}
                className="h-8 rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            )}
          </label>

          {requiresKey && (
            <label className="grid gap-1">
              <span className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
                <span>API key</span>
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

          <p className="text-[11px] text-muted-foreground">
            {provider === 'claude-cli'
              ? 'Uses your local Claude Code login. No key needed here.'
              : 'Stored locally only. Never leaves this machine.'}
          </p>
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
