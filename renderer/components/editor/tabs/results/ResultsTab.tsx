import { useRef, useState } from 'react'
import { BarChart3, Camera, Columns2, Crosshair, Loader2, Moon, RotateCcw, Sun, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useProjectStore } from '@/store/useProjectStore'
import { useResultsStore } from '@/store/useResultsStore'
import { useResultsViewer } from '@/hooks/useResultsViewer'
import { VECTOR_MAGNITUDE, type ComponentSelector } from '@/lib/vtk/fieldStats'
import type { CameraPreset } from '@/lib/vtk/ResultsEngine'
import { ViewerErrorBoundary, ViewerUnavailable } from '@/components/ui/ViewerErrorBoundary'
import { Select } from '@/components/ui/select'
import { PipelineTree } from './PipelineTree'
import { PropertiesPanel } from './PropertiesPanel'
import { TimeTransport } from './TimeTransport'

const SNAP_VIEWS: CameraPreset[] = ['+X', '-X', '+Y', '-Y', '+Z', '-Z', 'iso']

const toolBtnCls =
  'flex h-6 items-center justify-center rounded-sm px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground'

function formatValue(v: number): string {
  if (v === 0) return '0'
  const a = Math.abs(v)
  if (a < 0.001 || a >= 100000) return v.toExponential(3)
  return String(Math.round(v * 1e5) / 1e5)
}

export function ResultsTab() {
  return (
    <ViewerErrorBoundary>
      <ResultsTabInner />
    </ViewerErrorBoundary>
  )
}

function ResultsTabInner() {
  const executionAllowed = useProjectStore((s) => s.executionAllowed)
  const project = useProjectStore((s) => s.project)
  const background = useResultsStore((s) => s.background)
  const toggleBackground = useResultsStore((s) => s.toggleBackground)
  const compareEnabled = useResultsStore((s) => s.compareEnabled)
  const compareField = useResultsStore((s) => s.compareField)
  const compareComponent = useResultsStore((s) => s.compareComponent)
  const setCompareEnabled = useResultsStore((s) => s.setCompareEnabled)
  const setCompareField = useResultsStore((s) => s.setCompareField)
  const viewer = useResultsViewer(project)
  const [pipelineOpen, setPipelineOpen] = useState(() => window.innerWidth >= 1400)
  const [propertiesOpen, setPropertiesOpen] = useState(() => window.innerWidth >= 1400)
  const [screenshotError, setScreenshotError] = useState<string | null>(null)
  const [probeMode, setProbeMode] = useState(false)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const pointerDown = useRef<{ x: number; y: number } | null>(null)

  const takeScreenshot = async () => {
    setScreenshotError(null)
    try {
      const dataUrl = await viewer.engine.screenshot()
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `${project?.name ?? 'results'}-${Date.now()}.png`
      a.click()
    } catch (err) {
      setScreenshotError(err instanceof Error ? err.message : 'Screenshot could not be saved. Wait for the viewer to finish loading, then retry.')
    }
  }

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Open a project to view its results.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5" />
          <span>Results</span>
          <button className={toolBtnCls} aria-expanded={pipelineOpen} onClick={() => setPipelineOpen(!pipelineOpen)}>Pipeline</button>
          <button className={toolBtnCls} aria-expanded={propertiesOpen} onClick={() => setPropertiesOpen(!propertiesOpen)}>Properties</button>
          {viewer.status === 'ready' && (
            <span className="text-[11px]">
              {viewer.times.length} time step{viewer.times.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {SNAP_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              title={`View along ${v}`}
              className={toolBtnCls}
              onClick={() => viewer.engine.setCameraPreset(v)}
            >
              {v}
            </button>
          ))}
          <button type="button" title="Reset camera" className={toolBtnCls} onClick={() => viewer.engine.resetCamera()}>
            <RotateCcw className="h-3 w-3" />
          </button>
          <button
            type="button"
            title={background === 'dark' ? 'White background (reports)' : 'Dark background'}
            className={toolBtnCls}
            onClick={toggleBackground}
          >
            {background === 'dark' ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
          </button>
          <button
            type="button"
            title="Probe — click a point to read field values"
            className={cn(toolBtnCls, probeMode && 'bg-accent text-foreground')}
            onClick={() => {
              setProbeMode((m) => !m)
              if (probeMode) viewer.clearProbe()
            }}
          >
            <Crosshair className="h-3 w-3" />
          </button>
          <button
            type="button"
            title="Compare two fields side by side"
            className={cn(toolBtnCls, compareEnabled && 'bg-accent text-foreground')}
            onClick={() => {
              if (!compareEnabled && !compareField) {
                setCompareField(viewer.fields.find((f) => f.name === 'p')?.name ?? viewer.fields[0]?.name ?? null)
              }
              setCompareEnabled(!compareEnabled)
            }}
          >
            <Columns2 className="h-3 w-3" />
          </button>
          {compareEnabled && (
            <>
              <Select
                title="Compare field (right viewport)"
                size="sm"
                className="w-20"
                value={compareField ?? ''}
                onChange={(v) => setCompareField(v || null)}
              >
                {viewer.fields.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </Select>
              {(viewer.fields.find((f) => f.name === compareField)?.numComponents ?? 1) > 1 && (
                <Select
                  title="Compare component"
                  size="sm"
                  className="w-24"
                  value={String(compareComponent)}
                  onChange={(v) => setCompareField(compareField, Number(v) as ComponentSelector)}
                >
                  <option value={String(VECTOR_MAGNITUDE)}>Magnitude</option>
                  <option value="0">X</option>
                  <option value="1">Y</option>
                  <option value="2">Z</option>
                </Select>
              )}
            </>
          )}
          <button type="button" title="Save screenshot (PNG)" className={toolBtnCls} onClick={takeScreenshot}>
            <Camera className="h-3 w-3" />
          </button>
        </div>
      </div>

      {screenshotError && <div role="alert" className="border-b px-3 py-2 text-xs text-destructive">{screenshotError}<button className="ml-2 rounded border px-2 py-1" onClick={() => void takeScreenshot()}>Retry screenshot</button></div>}
      {(viewer.provenance || project.example) && <div className="border-b px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        {project.example ? 'Bundled reference data · No new run or validation of your inputs.' : <>
          Run {viewer.provenance?.runId ?? 'unrecorded'} · Input revision {viewer.provenance?.inputRevision?.slice(0, 12) ?? 'unavailable'} · Completion is not a physics-validation claim.
          {viewer.provenance?.stale && <span className="ml-2 text-amber-500">Inputs have changed since this result was produced.</span>}
        </>}
      </div>}
      {viewer.errorMessage && viewer.status !== 'error' && <div role="alert" className="border-b p-2 text-xs text-destructive">{viewer.errorMessage}</div>}
      <div className="flex min-h-0 flex-1">
        {pipelineOpen && <aside className="w-44 shrink-0 overflow-y-auto border-r bg-sidebar/30">
          <PipelineTree onAdd={viewer.status === 'ready' ? viewer.addDerivedItem : undefined} />
        </aside>}

        <div
          ref={viewportRef}
          className={cn('relative min-w-0 flex-1', probeMode && 'cursor-crosshair')}
          onPointerDown={(e) => {
            pointerDown.current = { x: e.clientX, y: e.clientY }
          }}
          onPointerUp={(e) => {
            const start = pointerDown.current
            pointerDown.current = null
            if (!probeMode || !start || !viewportRef.current) return
            // a drag is camera movement, not a probe
            if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) return
            viewer.probeAt(e.clientX, e.clientY, viewportRef.current)
          }}
        >
          <div ref={viewer.containerRef} className="absolute inset-0" />
          {probeMode && viewer.probe && (
            <div className="absolute bottom-2 left-2 z-10 rounded-sm border bg-background/95 px-2.5 py-1.5 text-[11px] leading-relaxed">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-foreground">
                  ({viewer.probe.position.map(formatValue).join(', ')})
                </span>
                <button
                  type="button"
                  title="Clear probe"
                  onClick={viewer.clearProbe}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <table className="text-muted-foreground">
                <tbody>
                  {Object.entries(viewer.probe.values).map(([name, vals]) => (
                    <tr key={name}>
                      <td className="pr-2 text-foreground">{name}</td>
                      <td className="tabular-nums">
                        {vals.length > 1
                          ? `(${vals.map(formatValue).join(', ')}) · |${formatValue(Math.hypot(...vals))}|`
                          : formatValue(vals[0]!)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {viewer.status === 'loading' && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading results…
            </div>
          )}
          {viewer.status === 'empty' && (
            <div className="absolute inset-0 flex items-center justify-center text-center text-xs text-muted-foreground">
              <div className="max-w-72 space-y-2">
                <p>No results data yet.</p>
                <p>Run the case, or convert an already-solved case with foamToVTK.</p>
                <button
                  type="button"
                  disabled={viewer.converting || !executionAllowed || !!project.example}
                  onClick={viewer.convert}
                  className="pointer-events-auto rounded-sm border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                >
                  {viewer.converting ? 'Converting…' : 'Convert results (foamToVTK)'}
                </button>
                {viewer.converting && viewer.convertLog.length > 0 && (
                  <p className="truncate text-[10px] opacity-60">
                    {viewer.convertLog[viewer.convertLog.length - 1]}
                  </p>
                )}
              </div>
            </div>
          )}
          {viewer.status === 'ready' && !viewer.hasTimeSeries && (
            <div className="absolute left-2 top-2 flex items-center gap-2 rounded-sm border bg-background/90 px-2 py-1 text-[11px] text-muted-foreground">
              <span>One saved time is available.</span>
              <button
                type="button"
                disabled={viewer.converting || !executionAllowed || !!project.example}
                onClick={viewer.convert}
                className="rounded-sm border px-1.5 py-0.5 hover:bg-accent disabled:opacity-50"
              >
                {viewer.converting ? 'Converting…' : 'Convert all time steps'}
              </button>
            </div>
          )}
          {viewer.status === 'error' && !viewer.contextLost && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-xs text-destructive">
              <p>{viewer.errorMessage}</p><button className="rounded border px-3 py-1.5" onClick={viewer.reload}>Retry loading results</button>
            </div>
          )}
          {viewer.contextLost && <ViewerUnavailable onRetry={viewer.retryContext} />}
        </div>

        {compareEnabled && (
          <div className="relative min-w-0 flex-1 border-l">
            <div ref={viewer.compareContainerRef} className="absolute inset-0" />
            <span className="pointer-events-none absolute left-2 top-2 rounded-sm border bg-background/90 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {compareField ?? '—'}
            </span>
          </div>
        )}

        {propertiesOpen && <aside className="w-56 shrink-0 overflow-y-auto border-l bg-sidebar/30">
          <PropertiesPanel fields={viewer.fields} bounds={viewer.bounds} />
        </aside>}
      </div>

      <TimeTransport times={viewer.times} />
    </div>
  )
}
