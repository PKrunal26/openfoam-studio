import { useEffect, useMemo, useRef } from 'react'
import { Box, Camera, Grid3x3, Maximize, Pause, Play, StepBack, StepForward, ZoomIn, ZoomOut } from 'lucide-react'
import { colormapGradient } from '@/lib/vtk/colormapSamples'
import { findItem, useViewerInfo, useWorkbench, type DisplayState } from '@c/store'
import { IconButton, Spinner, cn, formatNumber } from '@c/ui/primitives'
import { useViewer, type ViewerInfo, type ViewerScene } from '@c/viewer/useViewer'

function Legend({ info, display, fields }: { info: ViewerInfo; display: DisplayState; fields: Record<string, { label: string; unit: string }> }) {
  if (!info.range) return null
  const meta = fields[display.field] ?? { label: display.field, unit: '' }
  const vector = (info.fields.find((field) => field.name === display.field)?.numComponents ?? 1) > 1
  const component = vector ? (display.component === -1 ? ' magnitude' : ` ${'xyz'[display.component]}`) : ''
  const [lo, hi] = info.range
  // Snap numerical noise around zero (e.g. -4e-19 for a phase fraction) to a clean 0.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => lo + t * (hi - lo)).map((value) => (Math.abs(value) < (hi - lo) * 1e-6 ? 0 : value))
  return (
    <div className="w-[280px] bg-paper/90 px-3 pb-2 pt-2.5 backdrop-blur-sm">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="truncate text-[12.5px] font-medium">{meta.label}{component}</span>
        {meta.unit && meta.unit !== '–' && <span className="shrink-0 text-[12px] text-ink-3">{meta.unit}</span>}
      </div>
      <div className="h-2.5" style={{ background: colormapGradient(display.colormap) }} />
      <div className="t-mono mt-1 flex justify-between text-[11px] text-ink-2">
        {ticks.map((tick, index) => <span key={index}>{formatNumber(tick, 3)}</span>)}
      </div>
    </div>
  )
}

function TimeTransport({ info, steady }: { info: ViewerInfo; steady: boolean }) {
  const display = useWorkbench((state) => state.display)
  const setDisplay = useWorkbench((state) => state.setDisplay)
  const count = info.times.length
  if (count === 0) return null
  const time = info.times[info.stepIndex] ?? 0
  const label = steady ? `iteration ${formatNumber(time, 6)}` : `t = ${formatNumber(time, 4)} s`
  if (count === 1) return <div className="t-mono bg-paper/90 px-3 py-2 text-[12px] text-ink-2 backdrop-blur-sm">{label}{steady && ' · final solution'}</div>
  const go = (stepIndex: number) => setDisplay({ stepIndex: (stepIndex + count) % count, playing: false })
  return (
    <div className="pop flex w-[540px] max-w-full items-center gap-1 px-1.5 py-1.5">
      <button
        type="button" aria-label={display.playing ? 'Pause' : 'Play animation'} title={display.playing ? 'Pause' : 'Play animation'}
        className="flex h-8 w-8 shrink-0 items-center justify-center bg-primary text-white hover:bg-primary-hover"
        onClick={() => setDisplay({ playing: !display.playing, stepIndex: info.stepIndex })}
      >
        {display.playing ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <IconButton label="Previous step" onClick={() => go(info.stepIndex - 1)}><StepBack size={15} /></IconButton>
      <IconButton label="Next step" onClick={() => go(info.stepIndex + 1)}><StepForward size={15} /></IconButton>
      <input
        type="range" min={0} max={count - 1} step={1} aria-label="Time step" className="cls-slider mx-2 min-w-0 flex-1"
        style={{ '--pct': `${(info.stepIndex / (count - 1)) * 100}%` } as React.CSSProperties}
        value={info.stepIndex} onChange={(e) => setDisplay({ stepIndex: Number(e.target.value), playing: false })}
      />
      <span className="t-mono w-[92px] shrink-0 text-right text-[12px]">{label}</span>
      <span className="t-mono w-[46px] shrink-0 pr-1.5 text-right text-[11px] text-ink-3">{info.stepIndex + 1}/{count}</span>
    </div>
  )
}

function Message({ title, children, busy }: { title: string; children: React.ReactNode; busy?: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6">
      <div className="max-w-[400px] text-center">
        {busy && <Spinner size={20} className="mx-auto mb-3 text-primary" />}
        <p className="t-title text-[18px]">{title}</p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-3">{children}</p>
      </div>
    </div>
  )
}

export function ViewportArea({ hidden }: { hidden: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const tutorial = useWorkbench((state) => state.tutorial)!
  const workspace = useWorkbench((state) => state.workspace)!
  const selection = useWorkbench((state) => state.selection)
  const display = useWorkbench((state) => state.display)
  const setDisplay = useWorkbench((state) => state.setDisplay)
  const focusPatch = useWorkbench((state) => state.focusPatch)
  const hiddenPatches = useWorkbench((state) => state.hiddenPatches)
  const publish = useViewerInfo((state) => state.set)

  const resultsRun = selection.kind === 'run' && selection.view === 'fields' ? workspace.runs.find((run) => run.id === selection.runId && run.status === 'succeeded') : undefined
  const reference = workspace.runs[0]!
  // The mesh preview comes from the reference solution; fall back to any solved run.
  const geometryRun = reference.status === 'succeeded' ? reference : workspace.runs.find((run) => run.status === 'succeeded')
  const item = selection.kind === 'item' ? findItem(tutorial, selection.itemId)?.item : undefined
  const meshItem = item?.icon === 'mesh'
  const highlight = useMemo(() => (focusPatch ? [focusPatch] : item?.patches ?? []), [focusPatch, item])

  const scene: ViewerScene | null = useMemo(() => {
    if (resultsRun) return { tutorial, mode: 'results', runId: resultsRun.id, hash: resultsRun.hash, highlight: [], hidden: [], display }
    if (!geometryRun) return null
    return { tutorial, mode: 'geometry', runId: geometryRun.id, hash: geometryRun.hash, highlight, hidden: hiddenPatches, display: { ...display, edges: display.edges || meshItem } }
  }, [tutorial, resultsRun, geometryRun, highlight, hiddenPatches, display, meshItem])

  const { info, actions } = useViewer(containerRef, hidden ? null : scene, (stepIndex) => setDisplay({ stepIndex }))
  const mode = scene?.mode ?? 'geometry'

  useEffect(() => {
    publish({ loading: info.loading, fields: info.fields, times: info.times, stepIndex: info.stepIndex, range: info.range, patches: info.patches })
  }, [info, publish])

  const saveImage = async () => {
    const dataUrl = await actions.screenshot()
    if (!dataUrl) return
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `${tutorial.id}-${mode === 'results' ? `${resultsRun?.label.replace(/\s+/g, '-').toLowerCase()}-${display.field}` : 'geometry'}.png`
    link.click()
  }

  const viewButton = 'h-8 px-2 font-mono text-[11.5px] font-medium text-ink-2 hover:bg-wash hover:text-ink'

  return (
    <div className={cn('absolute inset-0 bg-wash', hidden && 'invisible')} aria-hidden={hidden}>
      <div ref={containerRef} className="absolute inset-0 overflow-hidden" />

      {!scene && (reference.status === 'running' || reference.status === 'queued'
        ? <Message title="Solving the reference case" busy>This happens once per server. The geometry and results appear here as soon as it finishes.</Message>
        : <Message title="No solved case to show yet">{reference.reason ?? 'The reference solution is not available.'}</Message>)}
      {info.contextLost && (
        <div className="absolute inset-0 bg-wash">
          <Message title="3D graphics are unavailable">Your browser could not start WebGL. Try reloading the page or turning on hardware acceleration. Plots, logs and case files still work.</Message>
        </div>
      )}
      {info.error && !info.contextLost && <div className="absolute inset-x-0 top-16 flex justify-center"><div className="pop px-4 py-2.5 text-[13.5px] text-bad">{info.error}</div></div>}

      <div className="pop absolute right-3 top-3 flex items-center p-0.5" role="toolbar" aria-label="View tools">
        <IconButton label="Fit to view" onClick={actions.fit}><Maximize size={15} /></IconButton>
        <IconButton label="Isometric view" onClick={() => actions.view('iso')}><Box size={15} /></IconButton>
        <button type="button" className={viewButton} title="Front view (x-y plane)" onClick={() => actions.view('front')}>XY</button>
        <button type="button" className={viewButton} title="Top view (x-z plane)" onClick={() => actions.view('top')}>XZ</button>
        <button type="button" className={viewButton} title="Side view (y-z plane)" onClick={() => actions.view('side')}>YZ</button>
        <span className="mx-0.5 h-5 w-px bg-line" />
        <IconButton label="Zoom in" onClick={() => actions.zoom(1.25)}><ZoomIn size={15} /></IconButton>
        <IconButton label="Zoom out" onClick={() => actions.zoom(0.8)}><ZoomOut size={15} /></IconButton>
        <span className="mx-0.5 h-5 w-px bg-line" />
        <IconButton label="Show mesh edges" active={display.edges || (mode === 'geometry' && !!meshItem)} onClick={() => setDisplay({ edges: !display.edges })}><Grid3x3 size={15} /></IconButton>
        <IconButton label="Save image" onClick={() => void saveImage()}><Camera size={15} /></IconButton>
      </div>

      {mode === 'results' && <div className="absolute left-3 top-3"><Legend info={info} display={display} fields={tutorial.results.fields} /></div>}

      {mode === 'results' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center pl-4 pr-[130px]">
          <div className="pointer-events-auto min-w-0"><TimeTransport info={info} steady={tutorial.run.steady} /></div>
        </div>
      )}
      {mode === 'geometry' && scene && (
        <p className="t-mono pointer-events-none absolute bottom-4 left-4 text-[11px] text-ink-3">
          {meshItem ? 'reference mesh' : 'drag: rotate  ·  shift + drag: pan  ·  scroll: zoom'}
        </p>
      )}
      {info.loading && !info.error && <p className="t-mono pointer-events-none absolute left-4 top-[84px] flex items-center gap-2 text-[11px] text-ink-3"><Spinner size={11} /> loading</p>}
    </div>
  )
}
