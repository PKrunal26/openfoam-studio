import { useEffect, useState, useCallback, useRef } from 'react'
import { CheckCircle2, AlertCircle, Loader2, Square, XCircle, Ban } from 'lucide-react'
import { useProjectStore } from '@/store/useProjectStore'
import { useRunsStore } from '@/store/useRunsStore'
import { useEditorStore } from '@/store/useEditorStore'
import * as api from '@/lib/api'
import { cn } from '@/lib/cn'

function statusIcon(s: api.RunRecord['status']) {
  if (s === 'running') return <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground/70" />
  if (s === 'success') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
  if (s === 'failed') return <AlertCircle className="h-3.5 w-3.5 text-destructive" />
  if (s === 'exhausted') return <XCircle className="h-3.5 w-3.5 text-destructive" />
  if (s === 'aborted') return <Ban className="h-3.5 w-3.5 text-muted-foreground" />
  return <Square className="h-3.5 w-3.5 text-muted-foreground" />
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s ago`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

function durationOf(r: api.RunRecord): string | null {
  if (!r.finishedAt) return null
  const ms = new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`
}

export function RunsPanel() {
  const project = useProjectStore((s) => s.project)
  const liveStatus = useRunsStore((s) => s.status)
  const liveRunId = useRunsStore((s) => s.currentRunId)
  const viewing = useRunsStore((s) => s.viewing)
  const historicalRunId = useRunsStore((s) => s.historicalRunId)
  const viewHistoricalRun = useRunsStore((s) => s.viewHistoricalRun)
  const viewLiveRun = useRunsStore((s) => s.viewLiveRun)
  const openSpecialTab = useEditorStore((s) => s.openSpecialTab)

  const [runs, setRuns] = useState<api.RunRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const request = useRef(0)
  useEffect(() => { request.current++; return () => { request.current++ } }, [project?.id])
  const refresh = useCallback(async () => {
    if (!project) return
    const token = ++request.current
    setLoading(true)
    try {
      const data = await api.listRuns(project.id)
      if (token !== request.current || useProjectStore.getState().project?.id !== project.id) return
      setRuns(data)
      setError(null)
    } catch (err) {
      if (token !== request.current) return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (token === request.current) setLoading(false)
    }
  }, [project])

  // Initial load + refresh after a live run reaches a terminal state.
  useEffect(() => {
    refresh()
  }, [refresh, liveStatus])

  if (!project) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">
        No project loaded.
      </div>
    )
  }

  const onClickRun = (run: api.RunRecord, results = false) => {
    openSpecialTab(results ? 'visualization' : 'logs', results ? 'Results' : 'Logs')
    if (liveStatus === 'running' && run.id === liveRunId) {
      viewLiveRun()
    } else {
      viewHistoricalRun(project.id, run)
    }
  }

  const isSelected = (run: api.RunRecord) => {
    if (viewing === 'live') return liveStatus === 'running' && run.id === liveRunId
    return run.id === historicalRunId
  }

  if (loading && runs.length === 0) {
    return <div className="px-3 py-2 text-xs text-muted-foreground">Loading runs…</div>
  }
  if (error) {
    return <div role="alert" className="px-3 py-2 text-xs text-destructive">{error}<button className="mt-2 rounded border px-2 py-1" onClick={() => void refresh()}>Retry</button></div>
  }
  if (runs.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">
        No runs yet. Click Run to start a simulation.
      </div>
    )
  }

  return (
    <div className="py-1">
      {runs.map((run) => {
        const selected = isSelected(run)
        const dur = durationOf(run)
        const exitsLabel = run.exits.length
          ? run.exits.map((e) => `${e.cmd}=${e.code}`).join(' · ')
          : null
        return (
          <div
            key={run.id}
            className={cn(
              'flex w-full flex-col items-start gap-0.5 border-l-2 px-3 py-1.5 text-left text-xs hover:bg-sidebar-accent/60',
              selected
                ? 'border-l-primary bg-sidebar-accent/40'
                : 'border-l-transparent',
            )}
          >
            <button onClick={() => onClickRun(run)} aria-label={`View logs for run ${run.id}`} className="flex w-full items-center gap-2 text-left">
              {statusIcon(run.status)}
              <span className="font-medium capitalize">{run.status === 'success' ? 'Completed' : run.status === 'reference' ? 'Reference data' : run.status}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">
                {timeAgo(run.startedAt)}
              </span>
            </button>
            <div className="flex w-full items-center gap-2 pl-5 text-[10px] text-muted-foreground">
              <span className="font-mono">{run.id}</span>
              {dur && <span>· {dur}</span>}
              {exitsLabel && <span className="truncate">· {exitsLabel}</span>}
            </div>
            {run.status !== 'running' && <button onClick={() => onClickRun(run, true)} className="ml-5 mt-1 rounded border px-2 py-0.5 text-[11px]" aria-label={`View results for run ${run.id}`}>View results</button>}
          </div>
        )
      })}
    </div>
  )
}
