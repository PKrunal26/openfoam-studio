import { backendFetch } from '@/lib/backendFetch'
import { useEffect, useRef, useState } from 'react'
import { Copy, Check, Loader2 } from 'lucide-react'
import * as api from '@/lib/api'
import { useDialogFocus } from '@/hooks/useDialogFocus'
import { backendUrl } from '@/lib/backendUrl'

const PRIORITY_ORDER: api.HealthCheckName[] = ['backend', 'docker', 'image', 'codex_cli', 'codex_auth', 'claude_cli', 'claude_auth']

const TITLES: Record<api.HealthCheckName, string> = {
  backend: 'Application connection',
  docker: 'Docker Desktop',
  image: 'OpenFOAM on Docker',
  codex_cli: 'Codex CLI',
  codex_auth: 'Codex login',
  claude_cli: 'Claude Code CLI',
  claude_auth: 'AI / API credentials',
}

interface Props {
  health: api.HealthResult
  onRecheck: () => Promise<api.HealthResult>
  onOpenSettings: () => void
  onInspect: () => void
}

export function SetupModal({ health, onRecheck, onOpenSettings, onInspect }: Props) {
  const activeCheck = PRIORITY_ORDER.map((name) =>
    health.checks.find((c) => c.name === name),
  ).find((c) => c && !c.pass)

  const [fixing, setFixing] = useState(false)
  const [rechecking, setRechecking] = useState(false)
  const [fixLog, setFixLog] = useState<string[]>([])
  const [copyFlash, setCopyFlash] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogFocus(dialogRef, true)
  useEffect(() => () => { abortRef.current?.abort() }, [])
  const abortRef = useRef<AbortController | null>(null)

  // Reset log when the active check changes (modal advances to next screen)
  useEffect(() => {
    setFixLog([])
    setFixing(false)
    setRechecking(false)
  }, [activeCheck?.name])

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [fixLog])

  if (!activeCheck) return null

  const busy = fixing || rechecking

  const onCopy = (command: string) => {
    navigator.clipboard.writeText(command).catch(() => {})
    setCopyFlash(command)
    setTimeout(() => setCopyFlash(null), 1500)
  }

  const onAutoFix = async () => {
    setFixing(true)
    setFixLog([])
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const res = await backendFetch(backendUrl('/health/fix/stream'), {
        method: 'POST',
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) throw new Error(`Fix request failed: ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let idx: number
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, idx).trim()
          buffer = buffer.slice(idx + 2)
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data:')) continue
            try {
              const evt = JSON.parse(line.slice(5).trim()) as { line?: string }
              if (evt.line) setFixLog((prev) => [...prev, evt.line!])
            } catch {
              /* ignore malformed frames */
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setFixLog((prev) => [...prev, `Error: ${(err as Error).message}`])
      }
    } finally {
      setFixing(false)
      abortRef.current = null
      await onRecheck().catch((err) => setFixLog((prev) => [...prev, String(err)]))
    }
  }

  const onManualRecheck = async () => {
    setRechecking(true)
    try {
      await onRecheck().catch((err) => setFixLog((prev) => [...prev, String(err)]))
    } finally {
      setRechecking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 py-6">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="setup-title" className="w-full max-w-lg rounded-lg border bg-card text-card-foreground shadow-xl">
        <header className="border-b px-4 py-3">
          <p className="mb-1 text-[11px] text-muted-foreground">Welcome to OpenFOAM Studio · Public alpha</p>
          <h2 id="setup-title" className="text-lg font-medium">Prepare your first simulation</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Review editable OpenFOAM cases, run them locally in Docker, and inspect the results. Start with the supported laminar cavity case.</p>
        </header>

        <div className="px-4 py-4 space-y-4">
          <ul className="grid gap-2 text-xs" aria-label="Prerequisite checklist">
            {health.checks.map((check) => <li key={check.name} className="flex justify-between gap-3"><span>{TITLES[check.name]}</span><span className={check.pass ? 'text-emerald-500' : 'text-amber-500'}>{check.pass ? 'Available' : 'Needs attention'}</span></li>)}
          </ul>
          <h3 className="text-sm font-medium">{TITLES[activeCheck.name]}</h3>
          <p className="text-sm text-muted-foreground">
            {activeCheck.name === 'backend'
              ? 'The local application server did not answer. Restart the application or local server, then retry the connection.'
              : activeCheck.name === 'docker'
              ? 'Docker is not reachable. Install Docker Desktop if needed, then start it.'
              : activeCheck.name === 'image'
                ? 'Download the OpenFOAM image to run simulations. This may take several minutes and requires free disk space.'
                : 'Sign into your selected CLI: codex login for Codex, or claude auth login for Claude Code. You can also choose an API provider in Settings. Use the explicit connection test to verify access.'}
          </p>

          {activeCheck.fix && !activeCheck.commands?.includes(activeCheck.fix) && (
            <p className="text-sm leading-relaxed text-muted-foreground">{activeCheck.fix}</p>
          )}
          {activeCheck.commands?.map(command => (
            <div key={command} className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 font-mono text-xs">
              <code className="min-w-0 flex-1 whitespace-pre-wrap break-all text-muted-foreground">$ {command}</code>
              <button
                onClick={() => onCopy(command)}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={`Copy ${command}`}
                title="Copy command"
              >
                {copyFlash === command ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))}

          <div className="flex gap-2">
            <button onClick={onOpenSettings} disabled={busy} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">
              AI settings
            </button>
            {activeCheck.canAutoFix && activeCheck.name !== 'claude_cli' && activeCheck.name !== 'codex_cli' && (
              <button
                onClick={onAutoFix}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors"
              >
                {fixing && <Loader2 className="h-3 w-3 animate-spin" />}
                {fixing ? 'Working…' : activeCheck.name === 'image' ? 'Download OpenFOAM' : 'Start Docker'}
              </button>
            )}
            <button
              onClick={onManualRecheck}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50 hover:bg-accent transition-colors"
            >
              {rechecking && <Loader2 className="h-3 w-3 animate-spin" />}
              {rechecking ? 'Checking…' : 'Retry checks'}
            </button>
          </div>

          {fixing && <button className="rounded border px-3 py-1.5 text-xs" onClick={() => abortRef.current?.abort()}>Cancel download / repair</button>}
          <button className="w-full rounded-md border px-3 py-2 text-xs hover:bg-accent" onClick={() => { abortRef.current?.abort(); onInspect() }}>Continue in inspect mode</button>
          <p className="text-[11px] leading-relaxed text-muted-foreground">Inspect mode lets you review existing cases and saved results while setup is incomplete. Docker is required to run; a working AI connection is required for the assistant.</p>
          {fixLog.length > 0 && (
            <div
              ref={logRef}
              className="max-h-40 overflow-y-auto rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground space-y-0.5"
            >
              {fixLog.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
