import { useEffect, useState, useCallback } from 'react'
import { CheckCircle2, AlertCircle, Terminal } from 'lucide-react'
import { useProjectStore } from '@/store/useProjectStore'
import { useRunsStore } from '@/store/useRunsStore'
import * as api from '@/lib/api'

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s ago`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

function durationLabel(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m${Math.floor((ms % 60_000) / 1000)}s`
}

function statusIcon(s: api.CommandRecord['status']) {
  if (s === 'success') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
  if (s === 'failed') return <AlertCircle className="h-3.5 w-3.5 text-destructive" />
  return <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
}

export function CommandsPanel() {
  const project = useProjectStore((s) => s.project)
  const liveStatus = useRunsStore((s) => s.status)

  const [commands, setCommands] = useState<api.CommandRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!project) return
    setLoading(true)
    try {
      const data = await api.listCommands(project.id, 200)
      setCommands(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [project])

  // Refresh on mount + whenever live run state changes (so new commands surface).
  useEffect(() => {
    refresh()
  }, [refresh, liveStatus])

  if (!project) {
    return <div className="px-3 py-2 text-xs text-muted-foreground">No project loaded.</div>
  }
  if (loading && commands.length === 0) {
    return <div className="px-3 py-2 text-xs text-muted-foreground">Loading commands…</div>
  }
  if (error) {
    return <div className="px-3 py-2 text-xs text-destructive">{error}</div>
  }
  if (commands.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">
        No commands yet. Run a simulation to see Docker invocations here.
      </div>
    )
  }

  return (
    <div className="py-1">
      {commands.map((c, i) => {
        const argsLabel = c.args.join(' ')
        return (
          <div
            key={`${c.runId}-${c.ts}-${i}`}
            className="flex flex-col gap-0.5 px-3 py-1.5 text-xs hover:bg-sidebar-accent/40"
          >
            <div className="flex items-center gap-2">
              {statusIcon(c.status)}
              <Terminal className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono font-medium text-foreground/90">{c.cmd}</span>
              {c.exitCode !== undefined && (
                <span className="text-[10px] text-muted-foreground">exit {c.exitCode}</span>
              )}
              <span className="ml-auto text-[10px] text-muted-foreground">
                {timeAgo(c.ts)}
              </span>
            </div>
            <div className="flex items-center gap-2 pl-5 text-[10px] text-muted-foreground">
              <span className="truncate font-mono">{argsLabel}</span>
              <span className="ml-auto shrink-0">· {durationLabel(c.durationMs)}</span>
            </div>
            {c.errorMessage && (
              <p className="pl-5 text-[10px] text-destructive">{c.errorMessage}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
