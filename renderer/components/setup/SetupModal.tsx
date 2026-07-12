import { useEffect, useRef, useState } from 'react'
import { Copy, Check, Loader2 } from 'lucide-react'
import * as api from '@/lib/api'
import { backendUrl } from '@/lib/backendUrl'

const PRIORITY_ORDER: api.HealthCheckName[] = ['docker', 'image', 'claude_cli', 'claude_auth']

const TITLES: Record<api.HealthCheckName, string> = {
  docker: 'Docker Desktop',
  image: 'OpenFOAM on Docker',
  claude_cli: 'Claude CLI',
  claude_auth: 'AI / API credentials',
}

interface Props {
  health: api.HealthResult
  onRecheck: () => Promise<api.HealthResult>
}

export function SetupModal({ health, onRecheck }: Props) {
  const activeCheck = PRIORITY_ORDER.map((name) =>
    health.checks.find((c) => c.name === name),
  ).find((c) => c && !c.pass)

  const [fixing, setFixing] = useState(false)
  const [rechecking, setRechecking] = useState(false)
  const [fixLog, setFixLog] = useState<string[]>([])
  const [copyFlash, setCopyFlash] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
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

  const onCopy = () => {
    navigator.clipboard.writeText(activeCheck.fix).catch(() => {})
    setCopyFlash(true)
    setTimeout(() => setCopyFlash(false), 1500)
  }

  const onAutoFix = async () => {
    setFixing(true)
    setFixLog([])
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const res = await fetch(backendUrl('/health/fix/stream'), {
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
      await onRecheck()
    }
  }

  const onManualRecheck = async () => {
    setRechecking(true)
    try {
      await onRecheck()
    } finally {
      setRechecking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 py-6">
      <div className="w-full max-w-md rounded-lg border bg-card text-card-foreground shadow-xl">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-medium">{TITLES[activeCheck.name]}</h2>
        </header>

        <div className="px-4 py-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            You don't have this installed. We require this for OpenFOAM Studio to work.
          </p>

          {activeCheck.fix && (
            <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 font-mono text-xs">
              <span className="flex-1 truncate text-muted-foreground">$ {activeCheck.fix}</span>
              <button
                onClick={onCopy}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                title="Copy command"
              >
                {copyFlash ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}

          <div className="flex gap-2">
            {activeCheck.canAutoFix && (
              <button
                onClick={onAutoFix}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors"
              >
                {fixing && <Loader2 className="h-3 w-3 animate-spin" />}
                {fixing ? 'Fixing…' : 'Fix it for me'}
              </button>
            )}
            <button
              onClick={onManualRecheck}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50 hover:bg-accent transition-colors"
            >
              {rechecking && <Loader2 className="h-3 w-3 animate-spin" />}
              {rechecking ? 'Checking…' : "I've done it"}
            </button>
          </div>

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
