import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Check, X } from 'lucide-react'
import { useWorkbench } from '@c/store'
import { Markdown, splitGuide } from '@c/ui/Markdown'
import { Button, cn } from '@c/ui/primitives'

export function GuidePanel() {
  const tutorial = useWorkbench((state) => state.tutorial)!
  const guide = useWorkbench((state) => state.guide)
  const setGuideOpen = useWorkbench((state) => state.setGuideOpen)
  const steps = useMemo(() => splitGuide(guide), [guide])
  const storageKey = `ofs-guide-step:${tutorial.id}`
  const [index, setIndex] = useState(() => {
    const saved = Number(window.localStorage.getItem(storageKey))
    return Number.isInteger(saved) && saved >= 0 ? saved : 0
  })
  const step = steps[Math.min(index, steps.length - 1)]
  const current = Math.min(index, Math.max(0, steps.length - 1))
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try { window.localStorage.setItem(storageKey, String(current)) } catch { /* private mode */ }
    scrollRef.current?.scrollTo({ top: 0 })
  }, [current, storageKey])

  return (
    <aside className="panel flex h-full w-[392px] shrink-0 flex-col overflow-hidden" aria-label="Tutorial guide">
      <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b px-4">
        <BookOpen size={19} className="text-accent-strong" />
        <span className="flex-1 truncate text-[17.5px] font-bold">Tutorial guide</span>
        <button type="button" aria-label="Close guide" title="Close guide" className="flex h-8 w-8 items-center justify-center rounded text-[#5d6975] hover:bg-muted" onClick={() => setGuideOpen(false)}><X size={18} /></button>
      </div>
      {steps.length === 0 || !step ? (
        <div className="p-4 text-[14.5px] text-muted-foreground">{tutorial.summary}</div>
      ) : (
        <>
          <div className="shrink-0 border-b px-4 py-3">
            <div className="flex items-center gap-1.5">
              {steps.map((entry, i) => (
                <button
                  key={i} type="button" aria-label={`Step ${i + 1}: ${entry.title}`} title={entry.title} aria-current={i === current ? 'step' : undefined}
                  className={cn('flex h-6 min-w-6 flex-1 items-center justify-center rounded-full text-[12px] font-bold transition-colors',
                    i === current ? 'bg-primary text-white' : i < current ? 'bg-[#d9f0e3] text-[#14713e]' : 'bg-[#e9edf0] text-[#5d6975] hover:bg-[#dbe1e6]')}
                  onClick={() => setIndex(i)}
                >
                  {i < current ? <Check size={13} strokeWidth={3} /> : i + 1}
                </button>
              ))}
            </div>
            <h2 className="mt-3 text-[19px] leading-snug font-bold">{step.title}</h2>
          </div>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
            <Markdown text={step.body} />
          </div>
          <div className="flex h-[58px] shrink-0 items-center justify-between border-t px-4">
            <Button variant="ghost" size="sm" disabled={current === 0} onClick={() => setIndex(current - 1)}><ArrowLeft size={16} /> Back</Button>
            <span className="text-[13px] text-muted-foreground">{current + 1} of {steps.length}</span>
            <Button variant="primary" size="sm" disabled={current >= steps.length - 1} onClick={() => setIndex(current + 1)}>Next <ArrowRight size={16} /></Button>
          </div>
        </>
      )}
    </aside>
  )
}
