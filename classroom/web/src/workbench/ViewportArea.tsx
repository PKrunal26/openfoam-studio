import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box, Camera, ChevronDown, Grid3x3, Maximize, Pause, Play, StepBack, StepForward, ZoomIn, ZoomOut,
} from 'lucide-react'
import { COLORMAPS } from '@/lib/vtk/colormaps'
import { colormapGradient } from '@/lib/vtk/colormapSamples'
import { findItem, useWorkbench, type DisplayState } from '@c/store'
import { IconButton, Spinner, cn, formatNumber } from '@c/ui/primitives'
import { useViewer, type ViewerInfo, type ViewerScene } from '@c/viewer/useViewer'
import { GeometryPanel } from './GeometryPanel'
import { SettingsPanel } from './SettingsPanel'

function fieldLabel(tutorialFields: Record<string, { label: string; unit: string }>, name: string) {
  return tutorialFields[name] ?? { label: name, unit: '' }
}

function Legend({ info, display, fields }: { info: ViewerInfo; display: DisplayState; fields: Record<string, { label: string; unit: string }> }) {
  if (!info.range) return null
  const meta = fieldLabel(fields, display.field)
  const vector = (info.fields.find((field) => field.name === display.field)?.numComponents ?? 1) > 1
  const component = vector ? (display.component === -1 ? ' magnitude' : ` ${'xyz'[display.component]}`) : ''
  const [lo, hi] = info.range
  // Snap numerical noise around zero (e.g. -4e-19 for a phase fraction) to a clean 0.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => lo + t * (hi - lo)).map((value) => (Math.abs(value) < (hi - lo) * 1e-6 ? 0 : value))
  return (
    <div className="panel-float w-[300px] px-3.5 pb-2.5 pt-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="truncate text-[14.5px] font-bold">{meta.label}{component}</span>
        {meta.unit && meta.unit !== '–' && <span className="shrink-0 text-[13px] text-muted-foreground">{meta.unit}</span>}
      </div>
      <div className="h-3.5 rounded-sm" style={{ background: colormapGradient(display.colormap) }} />
      <div className="mt-1 flex justify-between text-[12px] tabular-nums text-[#4b5661]">
        {ticks.map((tick, index) => <span key={index}>{formatNumber(tick, 3)}</span>)}
      </div>
    </div>
  )
}

function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={cn('flex h-9 cursor-pointer items-center justify-between gap-3 px-3.5 text-[14.5px]', disabled && 'cursor-not-allowed opacity-50')}>
      <span>{label}</span>
      <button
        type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
        className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-accent-strong' : 'bg-[#c5cdd5]')}
      >
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left]', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
    </label>
  )
}

function PanelSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2 px-3.5 py-1 text-[14.5px]">
      <span className="text-[#4b5661]">{label}</span>
      <span className="relative block h-9 border-b-2 border-[#cfd6dd] focus-within:border-accent-strong">
        <select className="h-full w-full cursor-pointer appearance-none bg-transparent pl-1 pr-6 outline-none" value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <ChevronDown size={15} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[#77838f]" />
      </span>
    </label>
  )
}

function ResultsPanel({ info, runLabel }: { info: ViewerInfo; runLabel: string }) {
  const tutorial = useWorkbench((state) => state.tutorial)!
  const display = useWorkbench((state) => state.display)
  const setDisplay = useWorkbench((state) => state.setDisplay)
  const names = info.fields.length ? info.fields.map((field) => field.name) : Object.keys(tutorial.results.fields)
  const current = info.fields.find((field) => field.name === display.field)
  const is3d = tutorial.dimension === '3D'
  return (
    <div className="panel-float flex max-h-full w-[320px] flex-col overflow-hidden">
      <div className="flex h-[52px] shrink-0 items-center justify-between border-b px-3.5">
        <span className="text-[17.5px] font-bold">Solution fields</span>
        <span className="text-[13px] text-muted-foreground">{runLabel}</span>
      </div>
      <div className="min-h-0 overflow-y-auto py-2">
        <PanelSelect
          label="Field" value={display.field} onChange={(field) => setDisplay({ field })}
          options={names.map((name) => { const meta = fieldLabel(tutorial.results.fields, name); return { value: name, label: `${meta.label} (${name})` } })}
        />
        {(current?.numComponents ?? 1) > 1 && (
          <PanelSelect
            label="Component" value={String(display.component)} onChange={(value) => setDisplay({ component: Number(value) as DisplayState['component'] })}
            options={[{ value: '-1', label: 'Magnitude' }, { value: '0', label: 'X' }, { value: '1', label: 'Y' }, { value: '2', label: 'Z' }]}
          />
        )}
        <PanelSelect label="Colors" value={display.colormap} onChange={(colormap) => setDisplay({ colormap })} options={COLORMAPS.map((map) => ({ value: map.id, label: map.label }))} />
        {info.times.length > 1 && (
          <PanelSelect
            label="Color range" value={display.rangeMode} onChange={(value) => setDisplay({ rangeMode: value as DisplayState['rangeMode'] })}
            options={[{ value: 'all', label: 'Fixed over the whole run' }, { value: 'step', label: 'Rescale every step' }]}
          />
        )}
        <div className="mx-3.5 my-2 border-t" />
        {is3d && (
          <>
            <Toggle label="Cutting plane" checked={display.slice} onChange={(slice) => setDisplay({ slice })} />
            {display.slice && (
              <div className="px-3.5 pb-2">
                <div className="mb-1.5 flex items-center gap-2 text-[14px]">
                  <span className="w-[84px] text-[#4b5661]">Normal</span>
                  <div className="flex overflow-hidden rounded border">
                    {(['X', 'Y', 'Z'] as const).map((axis, index) => (
                      <button key={axis} type="button" aria-pressed={display.sliceAxis === index} className={cn('h-8 w-10 text-[13.5px] font-bold', display.sliceAxis === index ? 'bg-primary text-white' : 'bg-white hover:bg-muted')} onClick={() => setDisplay({ sliceAxis: index as 0 | 1 | 2 })}>{axis}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[14px]">
                  <span className="w-[84px] text-[#4b5661]">Position</span>
                  <input
                    type="range" min={0} max={1} step={0.01} aria-label="Cutting plane position" className="cls-slider min-w-0 flex-1"
                    style={{ '--pct': `${display.slicePosition * 100}%` } as React.CSSProperties}
                    value={display.slicePosition} onChange={(e) => setDisplay({ slicePosition: Number(e.target.value) })}
                  />
                  <span className="w-9 text-right tabular-nums text-[#4b5661]">{Math.round(display.slicePosition * 100)}%</span>
                </div>
              </div>
            )}
          </>
        )}
        <Toggle label="Velocity vectors" checked={display.vectors} onChange={(vectors) => setDisplay({ vectors })} />
        <Toggle label="Mesh edges" checked={display.edges} onChange={(edges) => setDisplay({ edges })} disabled={is3d && display.slice} />
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
  const label = steady ? `Iteration ${formatNumber(time, 6)}` : `t = ${formatNumber(time, 4)} s`
  if (count === 1) return <div className="panel-float px-4 py-2 text-[14px] tabular-nums">{label}{steady && ' · final solution'}</div>
  const go = (stepIndex: number) => setDisplay({ stepIndex: (stepIndex + count) % count, playing: false })
  return (
    <div className="panel-float flex w-[560px] max-w-full items-center gap-1.5 px-2.5 py-1.5">
      <IconButton label="Previous step" onClick={() => go(info.stepIndex - 1)}><StepBack size={17} /></IconButton>
      <button
        type="button" aria-label={display.playing ? 'Pause' : 'Play animation'} title={display.playing ? 'Pause' : 'Play animation'}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white hover:bg-[#2a333d]"
        onClick={() => setDisplay({ playing: !display.playing, stepIndex: info.stepIndex })}
      >
        {display.playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>
      <IconButton label="Next step" onClick={() => go(info.stepIndex + 1)}><StepForward size={17} /></IconButton>
      <input
        type="range" min={0} max={count - 1} step={1} aria-label="Time step" className="cls-slider mx-1.5 min-w-0 flex-1"
        style={{ '--pct': `${(info.stepIndex / (count - 1)) * 100}%` } as React.CSSProperties}
        value={info.stepIndex} onChange={(e) => setDisplay({ stepIndex: Number(e.target.value), playing: false })}
      />
      <span className="w-[104px] shrink-0 text-right text-[14px] tabular-nums">{label}</span>
      <span className="w-[52px] shrink-0 text-right text-[12.5px] tabular-nums text-muted-foreground">{info.stepIndex + 1}/{count}</span>
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

  const mode = scene?.mode ?? 'geometry'
  // Width of the panel docked on the left, so the model can be centred in what remains.
  const [areaWidth, setAreaWidth] = useState(1000)
  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => { const width = entries[0]?.contentRect.width; if (width) setAreaWidth(width) })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const leftPanel = mode === 'results' && resultsRun ? 320 : item ? Math.min(470, areaWidth - 32) : 0
  const freeWidth = areaWidth - (leftPanel ? leftPanel + 32 : 0)
  /** Not enough room for the right-hand panels next to an open left panel. */
  const compact = leftPanel > 0 && freeWidth < 400
  const leftCover = leftPanel && !compact ? (leftPanel + 16) / areaWidth : 0

  const { info, actions } = useViewer(containerRef, hidden ? null : scene, (stepIndex) => setDisplay({ stepIndex }), leftCover)

  const saveImage = async () => {
    const dataUrl = await actions.screenshot()
    if (!dataUrl) return
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `${tutorial.id}-${mode === 'results' ? `${resultsRun?.label.replace(/\s+/g, '-').toLowerCase()}-${display.field}` : 'geometry'}.png`
    link.click()
  }

  return (
    <div className={cn('absolute inset-0', hidden && 'invisible')} aria-hidden={hidden}>
      <div ref={containerRef} className="absolute inset-0 overflow-hidden bg-[#f3f4f6]" />

      {!scene && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="panel max-w-[420px] px-6 py-5 text-center">
            {reference.status === 'running' || reference.status === 'queued'
              ? <><Spinner size={22} className="mx-auto text-accent-strong" /><p className="mt-3 text-[16px] font-bold">Solving the reference case…</p><p className="mt-1 text-[14px] text-muted-foreground">This happens once per server. The geometry and results appear here as soon as it finishes.</p></>
              : <><p className="text-[16px] font-bold">No solved case to show yet</p><p className="mt-1 text-[14px] text-muted-foreground">{reference.reason ?? 'The reference solution is not available.'}</p></>}
          </div>
        </div>
      )}
      {info.contextLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#f3f4f6]">
          <div className="panel max-w-[420px] px-6 py-5 text-center">
            <p className="text-[16px] font-bold">3D graphics are unavailable</p>
            <p className="mt-1 text-[14px] text-muted-foreground">Your browser could not start WebGL. Try reloading the page or enabling hardware acceleration. Convergence plots, logs and case files still work.</p>
          </div>
        </div>
      )}
      {info.error && !info.contextLost && (
        <div className="absolute inset-x-0 top-20 flex justify-center"><div className="panel px-4 py-3 text-[14px] text-danger">{info.error}</div></div>
      )}

      {/* left: the open setting, or result display options */}
      <div className="pointer-events-none absolute bottom-4 left-4 top-4 flex max-w-[calc(100%-32px)] flex-col">
        <div className="pointer-events-auto flex max-h-full min-h-0 flex-col">
          {mode === 'results' && resultsRun ? <ResultsPanel info={info} runLabel={resultsRun.isReference ? 'Run 1 · Reference' : resultsRun.label} />
            : item ? <SettingsPanel itemId={item.id} /> : null}
        </div>
      </div>

      {/* right: faces of the geometry, or the color legend */}
      <div className={cn('pointer-events-none absolute right-4 top-4 flex flex-col items-end gap-3', compact && 'hidden')}>
        <div className="panel-float pointer-events-auto flex items-center gap-0.5 px-1 py-1" role="toolbar" aria-label="View tools">
          <IconButton label="Fit to view" onClick={actions.fit}><Maximize size={18} /></IconButton>
          <IconButton label="Isometric view" onClick={() => actions.view('iso')}><Box size={18} /></IconButton>
          <button type="button" className="h-9 rounded-md px-2 text-[13px] font-bold text-[#4b5661] hover:bg-[#e9edf0]" title="Front view (x–y plane)" onClick={() => actions.view('front')}>XY</button>
          <button type="button" className="h-9 rounded-md px-2 text-[13px] font-bold text-[#4b5661] hover:bg-[#e9edf0]" title="Top view (x–z plane)" onClick={() => actions.view('top')}>XZ</button>
          <button type="button" className="h-9 rounded-md px-2 text-[13px] font-bold text-[#4b5661] hover:bg-[#e9edf0]" title="Side view (y–z plane)" onClick={() => actions.view('side')}>YZ</button>
          <span className="mx-1 h-6 w-px bg-border" />
          <IconButton label="Zoom in" onClick={() => actions.zoom(1.25)}><ZoomIn size={18} /></IconButton>
          <IconButton label="Zoom out" onClick={() => actions.zoom(0.8)}><ZoomOut size={18} /></IconButton>
          <span className="mx-1 h-6 w-px bg-border" />
          <IconButton label="Show mesh edges" active={display.edges || (mode === 'geometry' && !!meshItem)} onClick={() => setDisplay({ edges: !display.edges })}><Grid3x3 size={18} /></IconButton>
          <IconButton label="Save image" onClick={() => void saveImage()}><Camera size={18} /></IconButton>
        </div>
        <div className="pointer-events-auto">
          {mode === 'results' ? <Legend info={info} display={display} fields={tutorial.results.fields} />
            : scene && !(item && freeWidth < 760) ? <GeometryPanel highlighted={highlight} available={info.patches} /> : null}
        </div>
      </div>

      {mode === 'results' && (
        <div className="pointer-events-none absolute right-0 bottom-5 flex justify-center pl-4 pr-[150px]" style={{ left: leftCover ? leftPanel + 16 : 0 }}>
          <div className="pointer-events-auto min-w-0"><TimeTransport info={info} steady={tutorial.run.steady} /></div>
        </div>
      )}
      {mode === 'geometry' && scene && (
        <div className="pointer-events-none absolute right-0 bottom-5 flex justify-center px-4" style={{ left: leftCover ? leftPanel + 16 : 0 }}>
          <div className="truncate rounded-full bg-white/85 px-3.5 py-1.5 text-[12.5px] text-[#4b5661] shadow-sm">
            {meshItem ? 'Showing the reference mesh' : 'Drag to rotate · Shift + drag to pan · Scroll to zoom'}
          </div>
        </div>
      )}
      {info.loading && !info.error && (
        <div className="pointer-events-none absolute bottom-5 right-5 flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-[12.5px] text-[#4b5661] shadow-sm"><Spinner size={13} /> Loading…</div>
      )}
    </div>
  )
}
