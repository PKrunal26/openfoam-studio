import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { useWorkbench } from '@c/store'
import { Markdown, splitGuide } from '@c/ui/Markdown'
import { Button, cn, pad2 } from '@c/ui/primitives'

const STEP_COLORS = ['var(--v0)', 'var(--v1)', 'var(--v2)', 'var(--v3)', 'var(--v4)']

export function GuidePanel() {
  const tutorial = useWorkbench((state) => state.tutorial)!
  const guide = useWorkbench((state) => state.guide)
  const setGuideOpen = useWorkbench((state) => state.setGuideOpen)
  const steps = useMemo(() => splitGuide(guide), [guide])
  const storageKey = `ofs-guide-step:${tutorial.id}`
  const [index, setIndex] = useState(() => {
    try {
      const saved = Number(window.localStorage.getItem(storageKey))
      return Number.isInteger(saved) && saved >= 0 ? saved : 0
    } catch { return 0 }
  })
  const current = Math.min(index, Math.max(0, steps.length - 1))
  const step = steps[current]
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try { window.localStorage.setItem(storageKey, String(current)) } catch { /* private mode */ }
    scrollRef.current?.scrollTo({ top: 0 })
  }, [current, storageKey])

  return (
    <aside className="flex h-full w-[372px] shrink-0 flex-col border-l" aria-label="Tutorial guide">
      {steps.length === 0 || !step ? (
        <div className="p-6 text-[14px] text-ink-2">{tutorial.summary}</div>
      ) : (
        <>
          <header className="shrink-0 px-6 pb-4 pt-5">
            <div className="flex items-center justify-between">
              <p className="t-eyebrow">Guide · step {pad2(current + 1)} of {pad2(steps.length)}</p>
              <button type="button" aria-label="Close guide" title="Close guide" className="-mr-2 flex h-8 w-8 items-center justify-center text-ink-3 hover:bg-wash hover:text-ink" onClick={() => setGuideOpen(false)}><X size={17} /></button>
            </div>
            {/* Progress as blocks that walk through the colormap. */}
            <div className="mt-2.5 flex gap-[3px]">
              {steps.map((entry, i) => (
                <button
                  key={i} type="button" aria-label={`Step ${i + 1}: ${entry.title}`} title={entry.title} aria-current={i === current ? 'step' : undefined}
                  className={cn('h-2 flex-1 transition-opacity', i > current && 'bg-wash-2 hover:bg-line-strong')}
                  style={i <= current ? { background: STEP_COLORS[Math.min(4, Math.floor((i / Math.max(1, steps.length - 1)) * 4.999))] } : undefined}
                  onClick={() => setIndex(i)}
                />
              ))}
            </div>
            <h2 className="t-title mt-5 text-[24px]">{step.title}</h2>
          </header>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            <Markdown text={step.body} />
          </div>
          <footer className="flex h-14 shrink-0 items-center justify-between gap-2 border-t px-4">
            <Button variant="ghost" size="sm" disabled={current === 0} onClick={() => setIndex(current - 1)}><ArrowLeft size={14} /> Back</Button>
            <Button variant="ink" size="sm" disabled={current >= steps.length - 1} onClick={() => setIndex(current + 1)}>
              <span className="max-w-[190px] truncate">{steps[current + 1]?.title ?? 'Done'}</span> <ArrowRight size={14} />
            </Button>
          </footer>
        </>
      )}
    </aside>
  )
}
