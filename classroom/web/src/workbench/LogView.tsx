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
    <div className="flex h-full flex-col">
      {(run.status === 'failed' || run.status === 'error' || run.status === 'cancelled' || run.status === 'interrupted') && run.reason && (
        <div className="shrink-0 border-b px-5 py-3">
          <Notice tone={run.status === 'failed' || run.status === 'error' ? 'error' : 'warning'}>
            <span className="font-medium">{statusText(run.status)}{run.result?.failedStage ? ` during ${run.result.failedStage}` : ''}.</span> {run.reason}
          </Notice>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <div
          ref={boxRef}
          onScroll={(event) => { const box = event.currentTarget; stickRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 40 }}
          className="h-full overflow-auto bg-ink px-5 py-4 font-mono text-[12.5px] leading-[1.6] text-[#c9d6da]"
          tabIndex={0} aria-label="Solver log output"
        >
          {loading && <div className="flex items-center gap-2 text-[#7f9096]"><Spinner size={12} /> loading log</div>}
          {!loading && lines.length === 0 && <div className="text-[#7f9096]">{run.job?.state === 'queued' ? `Waiting for a free solver slot (position ${run.job.position}).` : 'No log output.'}</div>}
          {skipped > 0 && <div className="mb-2 text-[#7f9096]">{skipped.toLocaleString()} earlier lines not shown. Download the full log to see everything.</div>}
          {lines.map((line, index) => (
            <div key={index} className={cn('whitespace-pre', line.startsWith('────') && 'mt-3 font-medium text-[#5ec962]', /FOAM FATAL|FOAM exiting|^Stopped:/.test(line) && 'text-[#ff9a8f]', /^--> FOAM Warning/.test(line) && 'text-[#fde725]')}>{line || ' '}</div>
          ))}
        </div>
        <div className="absolute right-5 top-3 flex items-center gap-3">
          {active && <span className="t-mono flex items-center gap-1.5 bg-ink px-2 py-1 text-[11px] text-[#5ec962]"><Spinner size={11} /> live</span>}
          {run.result && !STATIC_DEMO && (
            <a className="inline-flex h-8 items-center gap-2 bg-paper px-3 text-[13px] font-medium text-ink hover:bg-wash" href={api.logDownloadUrl(tutorialId, run.id)}>
              <Download size={14} /> Full log
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
