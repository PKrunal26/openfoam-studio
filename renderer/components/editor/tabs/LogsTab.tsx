import { useEffect, useRef, useState, useMemo } from 'react'
import { CheckCircle2, AlertCircle, Loader2, Square, History, ArrowLeft } from 'lucide-react'
import { useRunsStore } from '@/store/useRunsStore'
import { cn } from '@/lib/cn'
import { ResidualChart } from './ResidualChart'
import type { ResidualPoint } from '@/store/useRunsStore'

const STATUS_LABEL: Record<string, string> = {
  idle: 'Idle',
  running: 'Running',
  success: 'Done',
  failed: 'Failed',
  exhausted: 'Max retries reached',
  aborted: 'Aborted',
}

const RESIDUAL_RE = /Solving for (\w+), Initial residual = ([\d.eE+-]+)/
const TIME_STEP_RE = /^Time = /

function parseResidualsFromLog(lines: string[]): ResidualPoint[] {
  const out: ResidualPoint[] = []
  let iter = 0
  for (const line of lines) {
    if (TIME_STEP_RE.test(line)) iter++
    const m = RESIDUAL_RE.exec(line)
    if (m) out.push({ field: m[1]!, iteration: iter, value: parseFloat(m[2]!) })
  }
  return out
}

export function LogsTab() {
  const viewing = useRunsStore((s) => s.viewing)
  const liveStatus = useRunsStore((s) => s.status)
  const liveLog = useRunsStore((s) => s.log)
  const liveResiduals = useRunsStore((s) => s.residuals)
  const liveExits = useRunsStore((s) => s.exits)
  const errorMessage = useRunsStore((s) => s.errorMessage)
  const unknownErrorTail = useRunsStore((s) => s.unknownErrorTail)
  const cancel = useRunsStore((s) => s.cancel)

  const historicalRecord = useRunsStore((s) => s.historicalRecord)
  const historicalLog = useRunsStore((s) => s.historicalLog)
  const historicalLoading = useRunsStore((s) => s.historicalLoading)
  const historicalError = useRunsStore((s) => s.historicalError)
  const viewLiveRun = useRunsStore((s) => s.viewLiveRun)

  const isHistorical = viewing === 'historical' && historicalRecord != null
  const status = isHistorical ? historicalRecord.status : liveStatus
  const log = isHistorical ? historicalLog : liveLog
  const exits = isHistorical ? historicalRecord.exits : liveExits
  const residuals = useMemo(
    () => (isHistorical ? parseResidualsFromLog(historicalLog) : liveResiduals),
    [isHistorical, historicalLog, liveResiduals],
  )

  const logRef = useRef<HTMLDivElement>(null)
  const [stickToBottom, setStickToBottom] = useState(true)

  useEffect(() => {
    if (!stickToBottom) return
    const el = logRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [log.length, stickToBottom])

  const onScroll = () => {
    const el = logRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8
    setStickToBottom(atBottom)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b bg-sidebar/40 px-3 py-2">
        <div className="flex items-center gap-2 text-xs">
          {status === 'running' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground/70" />
          ) : status === 'success' ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          ) : status === 'failed' || status === 'exhausted' ? (
            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
          ) : (
            <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
          )}
          <span className="font-medium">
            {STATUS_LABEL[status] ?? status}
          </span>
          {isHistorical && (
            <span className="inline-flex items-center gap-1 rounded-md border bg-background px-1.5 py-px text-[10px] font-mono text-muted-foreground">
              <History className="h-3 w-3" />
              {historicalRecord.id}
            </span>
          )}
          {exits.length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              · {exits.map((e) => `${e.cmd}=${e.code}`).join(' · ')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isHistorical && (
            <button
              onClick={viewLiveRun}
              className="inline-flex h-6 items-center gap-1 rounded-md border bg-background px-2 text-[11px] hover:bg-accent"
            >
              <ArrowLeft className="h-3 w-3" />
              Live
            </button>
          )}
          {!isHistorical && status === 'running' && (
            <button
              onClick={cancel}
              className="inline-flex h-6 items-center gap-1 rounded-md border bg-background px-2 text-[11px] hover:bg-accent"
            >
              <Square className="h-3 w-3 fill-current" />
              Stop
            </button>
          )}
        </div>
      </div>

      <div className="shrink-0 border-b bg-background px-3 py-2">
        <ResidualChart residuals={residuals} height={160} />
      </div>

      <div
        ref={logRef}
        onScroll={onScroll}
        className={cn(
          'flex-1 min-h-0 overflow-y-auto bg-background px-3 py-2 font-mono text-[11px] leading-relaxed',
        )}
      >
        {isHistorical && historicalLoading ? (
          <p className="text-muted-foreground">Loading historical log…</p>
        ) : isHistorical && historicalError ? (
          <p className="text-destructive">Failed to load log: {historicalError}</p>
        ) : log.length === 0 ? (
          <p className="text-muted-foreground">
            {isHistorical ? 'This run has no stored log.' : 'No output yet. Click Run to start a simulation.'}
          </p>
        ) : (
          log.map((line, i) => <LogLine key={i} line={line} />)
        )}
        {!isHistorical && errorMessage && (
          <p className="mt-2 whitespace-pre-wrap text-destructive">{errorMessage}</p>
        )}
        {!isHistorical && unknownErrorTail && (
          <details className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px]">
            <summary className="cursor-pointer text-destructive">
              Unrecognized error — show last 50 log lines
            </summary>
            <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap text-foreground/80">
              {unknownErrorTail}
            </pre>
          </details>
        )}
        {isHistorical && historicalRecord?.errorMessage && (
          <p className="mt-2 whitespace-pre-wrap text-destructive">{historicalRecord.errorMessage}</p>
        )}
      </div>
    </div>
  )
}

function LogLine({ line }: { line: string }) {
  const trimmed = line.trim()
  const cls = trimmed.startsWith('>')
    ? 'text-foreground/90'
    : trimmed.startsWith('FOAM FATAL ERROR') || trimmed.includes('FATAL')
      ? 'text-destructive'
      : trimmed.startsWith('Time =')
        ? 'text-amber-400'
        : 'text-foreground/75'
  return <div className={cls}>{line}</div>
}
