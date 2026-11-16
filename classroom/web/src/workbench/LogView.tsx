import { useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { api, isActive, STATIC_DEMO, type RunView } from '@c/api'
import { useWorkbench } from '@c/store'
import { Notice, Spinner, cn } from '@c/ui/primitives'
import { statusText } from './icons'

const TAIL = 4000

export function LogView({ run }: { run: RunView }) {
  const tutorialId = useWorkbench((state) => state.tutorial!.id)
  const [lines, setLines] = useState<string[]>([])
  const [skipped, setSkipped] = useState(0)
  const [loading, setLoading] = useState(true)
  const boxRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const active = isActive(run.status)

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let next = 0
    setLines([])
    setSkipped(0)
    setLoading(true)
    stickRef.current = true
    const poll = async () => {
      try {
        const chunk = await api.log(tutorialId, run.id, next === 0 ? `tail=${TAIL}` : `from=${next}`)
        if (!alive) return
        if (next === 0 && chunk.start) setSkipped(chunk.start)
        next = chunk.next
        if (chunk.lines.length) setLines((current) => [...current, ...chunk.lines].slice(-20000))
        setLoading(false)
        if (!chunk.done) timer = setTimeout(poll, chunk.lines.length >= 2000 ? 50 : 900)
      } catch {
        if (alive) { setLoading(false); timer = setTimeout(poll, 2500) }
      }
    }
    void poll()
    return () => { alive = false; if (timer) clearTimeout(timer) }
    // Re-subscribe when the run finishes so the stored log replaces the live tail.
  }, [tutorialId, run.id, run.status])

  useEffect(() => {
    const box = boxRef.current
    if (box && stickRef.current) box.scrollTop = box.scrollHeight
  }, [lines])

  return (
    <div className="flex h-full flex-col p-5">
      <div className="mx-auto flex min-h-0 w-full max-w-[1200px] flex-1 flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-[21px] font-bold">Solver log</h2>
            <p className="text-[14px] text-muted-foreground">{run.isReference ? 'Run 1 · Reference' : run.label} · {statusText(run.status)}{run.job?.state === 'queued' ? ` · position ${run.job.position} in the queue` : ''}</p>
          </div>
          <div className="flex items-center gap-3">
            {active && <span className="flex items-center gap-2 text-[14px] text-accent-foreground"><Spinner size={15} /> Live</span>}
            {run.result && !STATIC_DEMO && (
              <a className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-white px-3 text-[14px] font-bold hover:bg-muted" href={api.logDownloadUrl(tutorialId, run.id)}>
                <Download size={16} /> Download full log
              </a>
            )}
          </div>
        </div>
        {(run.status === 'failed' || run.status === 'error' || run.status === 'cancelled' || run.status === 'interrupted') && run.reason && (
          <Notice tone={run.status === 'failed' || run.status === 'error' ? 'error' : 'warning'}>
            <span className="font-bold">{statusText(run.status)}{run.result?.failedStage ? ` during ${run.result.failedStage}` : ''}.</span> {run.reason}
          </Notice>
        )}
        <div
          ref={boxRef}
          onScroll={(event) => { const box = event.currentTarget; stickRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 40 }}
          className="panel min-h-0 flex-1 overflow-auto bg-[#12181f] p-4 font-mono text-[12.5px] leading-[1.55] text-[#d5dde5]"
          tabIndex={0} aria-label="Solver log output"
        >
          {loading && <div className="flex items-center gap-2 text-[#8d9aa7]"><Spinner size={13} /> Loading log…</div>}
          {!loading && lines.length === 0 && <div className="text-[#8d9aa7]">{run.job?.state === 'queued' ? 'Waiting for a free solver slot…' : 'No log output.'}</div>}
          {skipped > 0 && <div className="mb-2 text-[#8d9aa7]">… {skipped.toLocaleString()} earlier lines not shown. Download the full log to see everything.</div>}
          {lines.map((line, index) => (
            <div key={index} className={cn('whitespace-pre', line.startsWith('────') && 'mt-2 font-bold text-[#6fd0f5]', /FOAM FATAL|FOAM exiting|^Stopped:/.test(line) && 'text-[#ff8f8f]', /^--> FOAM Warning/.test(line) && 'text-[#f5cf6f]')}>{line || ' '}</div>
          ))}
        </div>
      </div>
    </div>
  )
}
