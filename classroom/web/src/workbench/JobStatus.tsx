import { X } from 'lucide-react'
import { isActive, type RunView } from '@c/api'
import { useWorkbench } from '@c/store'
import { formatDuration, timeAgo } from '@c/ui/primitives'
import { StatusRing, statusText } from './icons'

const STAGE_LABEL = { mesh: 'Meshing', initialise: 'Initialising fields', solve: 'Solving', export: 'Exporting results' } as const

function detail(run: RunView): string {
  if (run.job?.state === 'queued') return run.job.position > 1 ? `Queued · ${run.job.position - 1} ahead of you` : 'Queued · starting next'
  if (run.job?.state === 'running') {
    const stage = run.job.stage ? STAGE_LABEL[run.job.stage] : 'Starting'
    return run.job.stage === 'solve' ? `${stage} · ${Math.round(run.job.progress * 100)}%` : stage
  }
  if (run.status === 'succeeded' && run.result) return `Finished in ${formatDuration(run.result.durationMs)}${run.isReference ? '' : ` · ${timeAgo(run.createdAt)}`}`
  return statusText(run.status)
}

export function JobStatus() {
  const tutorial = useWorkbench((state) => state.tutorial)!
  const runs = useWorkbench((state) => state.workspace!.runs)
  const select = useWorkbench((state) => state.select)
  const cancelRun = useWorkbench((state) => state.cancelRun)
  const ordered = [...runs].reverse()
  return (
    <div className="panel flex max-h-[34%] shrink-0 flex-col overflow-hidden">
      <div className="flex h-11 shrink-0 items-center border-b px-3.5 text-[16.5px] font-bold">Job status</div>
      <div className="overflow-y-auto">
        {ordered.map((run) => (
          <div key={run.id} className="relative border-b last:border-b-0">
            <button
              type="button" className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-[#f5f7f9]"
              onClick={() => select({ kind: 'run', runId: run.id, view: run.status === 'succeeded' ? 'fields' : 'log' })}
            >
              <StatusRing status={run.status} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">{tutorial.analysisType} – {run.isReference ? 'Run 1' : run.label}</span>
                <span className="block truncate text-[13px] text-muted-foreground">{detail(run)}</span>
              </span>
            </button>
            {run.job?.state === 'running' && (
              <div className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden bg-[#e3e8ec]">
                {run.job.stage === 'solve'
                  ? <div className="h-full bg-accent-strong transition-[width] duration-700" style={{ width: `${Math.max(3, run.job.progress * 100)}%` }} />
                  : <div className="cls-indeterminate h-full w-1/3 bg-accent-strong" />}
              </div>
            )}
            {isActive(run.status) && !run.isReference && (
              <button
                type="button" aria-label={`Cancel ${run.label}`} title="Cancel this run"
                className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-[#77838f] hover:bg-[#dfe5ea] hover:text-danger"
                onClick={() => void cancelRun(run.id)}
              >
                <X size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
