// Orchestration for the Results tab: owns a ResultsEngine instance and a
// ResultsDataSource, and keeps the engine in sync with useResultsStore. This
// hook (plus lib/vtk/*) is the only place that touches vtk.js — components
// stay plain React.

import { useCallback, useEffect, useRef, useState } from 'react'
import { getVtkManifest, vtkFileUrl, type ProjectMeta } from '@/lib/api'
import { streamPostprocess } from '@/lib/sse'
import { ResultsEngine, syncCameras } from '@/lib/vtk/ResultsEngine'
import { probePoint } from '@/lib/vtk/probe'
import { ResultsDataSource, stepRange, type FieldInfo, type LoadedStep } from '@/lib/vtk/resultsData'
import { extractComponent, computeRange, VECTOR_MAGNITUDE } from '@/lib/vtk/fieldStats'
import type { VtkDataArray } from '@/lib/vtk/legacyVtkParser'
import { tetrahedralize } from '@/lib/vtk/tetrahedralize'
import { slicePlane, interpolateField } from '@/lib/vtk/slice'
import { isoSurface } from '@/lib/vtk/isoSurface'
import { clipCells } from '@/lib/vtk/clip'
import { extractExternalSurface } from '@/lib/vtk/surfaceExtract'
import { traceStreamlines, makeLineSeeds } from '@/lib/vtk/streamlines'
import { sampleVectorGlyphs } from '@/lib/vtk/glyphs'
import { useResultsStore, type PipelineItem } from '@/store/useResultsStore'

export type Vec3 = [number, number, number]

export interface DomainBounds {
  min: Vec3
  max: Vec3
  center: Vec3
  diagonal: number
}

function computeBounds(points: Float32Array): DomainBounds {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < points.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = points[i + a]!
      if (v < min[a]!) min[a] = v
      if (v > max[a]!) max[a] = v
    }
  }
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  const dx = max[0] - min[0]
  const dy = max[1] - min[1]
  const dz = max[2] - min[2]
  return { min, max, center, diagonal: Math.sqrt(dx * dx + dy * dy + dz * dz) }
}

// Tet decomposition is mesh-topology-only, so one soup serves every time step.
const tetCache = new WeakMap<object, Uint32Array>()
function tetsFor(step: LoadedStep): Uint32Array | null {
  if (!step.internal?.cells) return null
  const cached = tetCache.get(step.internal.cells)
  if (cached) return cached
  const { tets } = tetrahedralize(step.internal.cells)
  tetCache.set(step.internal.cells, tets)
  return tets
}

export type ViewerStatus = 'loading' | 'empty' | 'ready' | 'error'

export interface ProbeResult {
  position: Vec3
  values: Record<string, number[]>
}

export interface ResultsViewer {
  containerRef: (el: HTMLDivElement | null) => void
  /** Container for the right-hand compare viewport (mount only when comparing). */
  compareContainerRef: (el: HTMLDivElement | null) => void
  engine: ResultsEngine
  status: ViewerStatus
  errorMessage: string | null
  times: number[]
  fields: FieldInfo[]
  /** domain bounding box of the internal mesh (null until loaded) */
  bounds: DomainBounds | null
  /** true when more than one time step is available */
  hasTimeSeries: boolean
  converting: boolean
  convertLog: string[]
  /** Re-runs foamToVTK on the case, then reloads the manifest. */
  convert: () => void
  /** Adds a derived pipeline item (slice/clip/glyphs/streamlines/iso) with sensible defaults. */
  addDerivedItem: (type: 'slice' | 'clip' | 'glyphs' | 'streamlines' | 'iso') => void
  /** Interpolated field readout at the clicked surface point (probe mode). */
  probe: ProbeResult | null
  probeAt: (clientX: number, clientY: number, container: HTMLElement) => void
  clearProbe: () => void
  /** True when the WebGL context was lost/unavailable — show the fallback. */
  contextLost: boolean
  /** Tear down and re-initialise the viewer after a context loss. */
  retryContext: () => void
}

function componentLabel(component: number): string {
  switch (component) {
    case 0: return ' X'
    case 1: return ' Y'
    case 2: return ' Z'
    default: return ' Magnitude'
  }
}

/** Field whose all-time range drives the legend for items not colored by a picked field. */
function rangeField(
  item: PipelineItem,
): { field: string; component: typeof item.component } | null {
  if (item.type === 'streamlines' || item.type === 'glyphs') {
    return { field: 'U', component: VECTOR_MAGNITUDE }
  }
  return item.field ? { field: item.field, component: item.component } : null
}

export function useResultsViewer(project: ProjectMeta | null): ResultsViewer {
  const engineRef = useRef<ResultsEngine | null>(null)
  if (!engineRef.current) engineRef.current = new ResultsEngine()
  const engine = engineRef.current
  const engineBRef = useRef<ResultsEngine | null>(null)
  if (!engineBRef.current) engineBRef.current = new ResultsEngine()
  const engineB = engineBRef.current
  const [compareMounted, setCompareMounted] = useState(false)
  const pushedGeometryB = useRef(new Map<string, string>())
  const [probe, setProbe] = useState<ProbeResult | null>(null)

  const sourceRef = useRef<ResultsDataSource | null>(null)
  const [status, setStatus] = useState<ViewerStatus>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [times, setTimes] = useState<number[]>([])
  const [fields, setFields] = useState<FieldInfo[]>([])
  const [converting, setConverting] = useState(false)
  const [convertLog, setConvertLog] = useState<string[]>([])
  const [bounds, setBounds] = useState<DomainBounds | null>(null)
  const [dataVersion, setDataVersion] = useState(0)
  /** itemId → geometry cache key ("<timeIndex>|<params json>") */
  const pushedGeometry = useRef(new Map<string, string>())
  const didResetCamera = useRef(false)
  const syncToken = useRef(0)

  const items = useResultsStore((s) => s.items)
  const selectedId = useResultsStore((s) => s.selectedId)
  const timeIndex = useResultsStore((s) => s.timeIndex)
  const playing = useResultsStore((s) => s.playing)
  const speed = useResultsStore((s) => s.speed)
  const background = useResultsStore((s) => s.background)
  const compareEnabled = useResultsStore((s) => s.compareEnabled)
  const compareField = useResultsStore((s) => s.compareField)
  const compareComponent = useResultsStore((s) => s.compareComponent)
  const initPipeline = useResultsStore((s) => s.initPipeline)
  const setTimeIndex = useResultsStore((s) => s.setTimeIndex)

  // ── Engine lifecycle, bound to the container element ───────────────────────
  const [contextLost, setContextLost] = useState(false)
  const containerElRef = useRef<HTMLDivElement | null>(null)
  const resizeObs = useRef<ResizeObserver | null>(null)
  const initEngine = useCallback(
    (el: HTMLDivElement) => {
      engine.init(el, {
        onLost: () => setContextLost(true),
        // The GPU process recovered on its own — reload geometry into the
        // revived context.
        onRestored: () => {
          setContextLost(false)
          setDataVersion((v) => v + 1)
        },
      })
      // Proactive guard: if the context is already gone at mount time, show the
      // fallback rather than waiting for a render to throw.
      if (!engine.hasUsableContext()) setContextLost(true)
    },
    [engine],
  )
  const containerRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) {
        containerElRef.current = el
        initEngine(el)
        resizeObs.current = new ResizeObserver(() => engine.resize())
        resizeObs.current.observe(el)
      } else {
        containerElRef.current = null
        resizeObs.current?.disconnect()
        resizeObs.current = null
        engine.dispose()
        pushedGeometry.current.clear()
        didResetCamera.current = false
      }
    },
    [engine, initEngine],
  )

  // Full teardown + re-init when the user clicks Retry after a context loss.
  const retryContext = useCallback(() => {
    const el = containerElRef.current
    if (!el) return
    engine.dispose()
    pushedGeometry.current.clear()
    didResetCamera.current = false
    initEngine(el)
    setContextLost(false)
    setDataVersion((v) => v + 1)
  }, [engine, initEngine])

  const resizeObsB = useRef<ResizeObserver | null>(null)
  const compareContainerRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) {
        engineB.init(el)
        resizeObsB.current = new ResizeObserver(() => engineB.resize())
        resizeObsB.current.observe(el)
        setCompareMounted(true)
      } else {
        resizeObsB.current?.disconnect()
        resizeObsB.current = null
        engineB.dispose()
        pushedGeometryB.current.clear()
        setCompareMounted(false)
      }
    },
    [engineB],
  )

  // ── Manifest → data source ─────────────────────────────────────────────────
  useEffect(() => {
    if (!project) return
    let cancelled = false
    setStatus('loading')
    ;(async () => {
      try {
        const manifest = await getVtkManifest(project.id)
        if (cancelled) return
        const source = new ResultsDataSource(manifest.series, async (relPath) => {
          const res = await fetch(vtkFileUrl(project.id, relPath))
          if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${relPath}`)
          return res.text()
        })
        sourceRef.current = source
        pushedGeometry.current.clear()
        if (source.numSteps === 0) {
          setTimes([])
          setFields([])
          setStatus('empty')
          return
        }
        const fieldInfos = await source.fieldsAt(source.numSteps - 1)
        if (cancelled) return
        const lastStep = await source.loadStep(source.numSteps - 1)
        if (cancelled) return
        if (lastStep.internal) setBounds(computeBounds(lastStep.internal.points))
        setTimes(source.times)
        setFields(fieldInfos)
        const patchNames = Object.keys(manifest.series.steps[manifest.series.steps.length - 1]?.patches ?? {})
        initPipeline(project.id, fieldInfos, patchNames)
        // Default to the last written time — that is the converged solution.
        if (useResultsStore.getState().timeIndex >= source.numSteps) setTimeIndex(source.numSteps - 1)
        else if (useResultsStore.getState().timeIndex === 0 && source.numSteps > 1) setTimeIndex(source.numSteps - 1)
        setStatus('ready')
        setErrorMessage(null)
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : String(err))
          setStatus('error')
        }
      }
    })()
    return () => { cancelled = true }
  }, [project, initPipeline, setTimeIndex, dataVersion])

  // ── Store state → engine sync ──────────────────────────────────────────────
  useEffect(() => {
    const source = sourceRef.current
    if (!source || status !== 'ready' || source.numSteps === 0) return
    const token = ++syncToken.current
    ;(async () => {
      const index = Math.min(timeIndex, source.numSteps - 1)
      const step = await source.loadStep(index)
      if (token !== syncToken.current) return

      const legendTitle = (item: PipelineItem): string =>
        `${item.field}${
          (fields.find((f) => f.name === item.field)?.numComponents ?? 1) > 1
            ? componentLabel(item.component)
            : ''
        }`

      // Pushes the pipeline into one engine. In the compare viewport every
      // field-colored surface (mesh/patch/slice/clip) is recolored by the
      // compare field; iso/streamlines/glyphs keep their own coloring since
      // their geometry/meaning is bound to a specific field.
      const pushPipeline = async (
        target: ResultsEngine,
        pushed: Map<string, string>,
        overrideField: { field: string; component: typeof compareComponent } | null,
      ): Promise<void> => {
        const liveIds = new Set<string>()
        for (const item of items) {
          const overridable =
            item.type === 'mesh' || item.type === 'patch' || item.type === 'slice' || item.type === 'clip'
          const effective: PipelineItem =
            overrideField && overridable && item.field
              ? { ...item, field: overrideField.field, component: overrideField.component }
              : item
          const computed = computeItem(effective, step)
          if (!computed) continue
          liveIds.add(item.id)

          const geomKey = `${index}|${effective.field}|${effective.component}|${JSON.stringify(item.params ?? null)}`
          if (pushed.get(item.id) !== geomKey || !target.hasItem(item.id)) {
            if (computed.kind === 'glyph') {
              target.setGlyphGeometry(item.id, computed.positions, computed.vectors, computed.scaleFactor)
            } else {
              target.setItemGeometry(item.id, {
                points: computed.points,
                polys: computed.polys,
                lines: computed.lines,
              })
            }
            pushed.set(item.id, geomKey)
          }

          let range: [number, number] = item.manualRange
          if (effective.rangeMode === 'auto' || overrideField) {
            range = computed.scalars ? computeRange(computed.scalars) : [0, 1]
          } else if (effective.rangeMode === 'allTime') {
            const rf = rangeField(effective)
            if (rf) {
              range = await source.allTimeRange(rf.field, rf.component)
              if (token !== syncToken.current) return
            }
          }

          target.setItemProps(item.id, {
            visible: item.visible,
            opacity: item.opacity,
            representation: item.representation,
            colormap: item.colormap,
            range,
            scalars: computed.scalars,
          })
        }
        // Remove engine items whose pipeline entry was deleted.
        for (const id of [...pushed.keys()]) {
          if (!liveIds.has(id)) {
            target.removeItem(id)
            pushed.delete(id)
          }
        }

        // Legend follows the selected item when it is colored by a field,
        // otherwise the first visible colored item.
        const legendItem =
          items.find((i) => i.id === selectedId && i.visible && i.field) ??
          items.find((i) => i.visible && i.field)
        const legendEffective: PipelineItem | undefined =
          legendItem && overrideField
            ? { ...legendItem, field: overrideField.field, component: overrideField.component }
            : legendItem
        target.setScalarBar(
          legendItem?.id ?? null,
          legendEffective ? legendTitle(legendEffective) : '',
        )
        target.setBackground(background)
      }

      await pushPipeline(engine, pushedGeometry.current, null)
      if (token !== syncToken.current) return
      if (compareEnabled && compareMounted && compareField) {
        await pushPipeline(engineB, pushedGeometryB.current, {
          field: compareField,
          component: compareComponent,
        })
        if (token !== syncToken.current) return
        engineB.render()
      }

      if (!didResetCamera.current) {
        didResetCamera.current = true
        // Defer the first camera fit until after layout/paint — at mount time
        // the flex layout may not have constrained the container yet, so an
        // immediate fit would use a bogus viewport size.
        requestAnimationFrame(() => {
          engine.resize()
          engine.resetCamera()
        })
      }
      engine.render()
    })().catch((err) => {
      if (token === syncToken.current) {
        setErrorMessage(err instanceof Error ? err.message : String(err))
        setStatus('error')
      }
    })
  }, [engine, engineB, items, selectedId, timeIndex, background, status, fields, compareEnabled, compareMounted, compareField, compareComponent])

  // ── Compare viewport: mirror cameras ────────────────────────────────────────
  useEffect(() => {
    if (!compareEnabled || !compareMounted) return
    engineB.resize()
    return syncCameras(engine, engineB)
  }, [engine, engineB, compareEnabled, compareMounted])

  // ── Probe ───────────────────────────────────────────────────────────────────
  const probeAt = useCallback(
    (clientX: number, clientY: number, container: HTMLElement) => {
      const source = sourceRef.current
      if (!source || source.numSteps === 0) return
      const world = engine.pickWorldPoint(clientX, clientY, container)
      if (!world) {
        setProbe(null)
        return
      }
      void (async () => {
        const index = Math.min(useResultsStore.getState().timeIndex, source.numSteps - 1)
        const step = await source.loadStep(index)
        if (!step.internal?.cells) return
        const values = probePoint(step.internal.points, step.internal.cells, step.internal.pointData, world)
        setProbe(values ? { position: world, values } : null)
      })()
    },
    [engine],
  )
  const clearProbe = useCallback(() => setProbe(null), [])
  // A probe readout is a snapshot of one instant — drop it when time moves.
  useEffect(() => setProbe(null), [timeIndex])

  // NOTE: a draggable ImplicitPlaneWidget for slice/clip was evaluated and
  // dropped — vtk.js v35's widget handles don't scale correctly under
  // GenericRenderWindow (displayScaleParams never update) and degenerate on
  // flat quasi-2D domains. Plane manipulation ships as axis presets + offset
  // slider + numeric normal inputs in the properties panel instead.

  // ── Playback ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || times.length < 2) return
    const handle = setInterval(() => {
      const s = useResultsStore.getState()
      s.setTimeIndex((s.timeIndex + 1) % times.length)
    }, 1000 / Math.max(speed, 0.1))
    return () => clearInterval(handle)
  }, [playing, speed, times.length])

  // ── foamToVTK re-conversion ────────────────────────────────────────────────
  const convert = useCallback(() => {
    if (!project || converting) return
    setConverting(true)
    setConvertLog([])
    streamPostprocess(project.id, {
      onEvent: (e) => {
        if (e.type === 'log') setConvertLog((log) => [...log.slice(-200), e.line])
        if (e.type === 'error') setErrorMessage(e.message)
      },
      onClose: () => {
        setConverting(false)
        setDataVersion((v) => v + 1) // reload manifest
      },
      onError: (err) => {
        setConverting(false)
        setErrorMessage(err.message)
      },
    })
  }, [project, converting])

  // ── Derived pipeline items ─────────────────────────────────────────────────
  const addDerivedItem = useCallback(
    (type: 'slice' | 'clip' | 'glyphs' | 'streamlines' | 'iso') => {
      const source = sourceRef.current
      if (!source || !bounds) return
      void (async () => {
        const state = useResultsStore.getState()
        const step = await source.loadStep(Math.min(state.timeIndex, source.numSteps - 1))
        const { center, min, max, diagonal } = bounds

        const meshItem = state.items.find((i) => i.type === 'mesh')
        const defaultField = meshItem?.field ?? fields[0]?.name ?? null
        const count = state.items.filter((i) => i.type === type).length + 1
        const id = `${type}-${Date.now().toString(36)}`

        let params: Record<string, unknown> = {}
        let field = defaultField
        let component = meshItem?.component ?? VECTOR_MAGNITUDE
        let label = ''
        switch (type) {
          case 'slice':
            label = `Slice ${count}`
            params = { origin: [...center], normal: [0, 0, 1], offsetT: 0.5 }
            break
          case 'clip':
            label = `Clip ${count}`
            params = { origin: [...center], normal: [1, 0, 0], offsetT: 0.5 }
            break
          case 'glyphs': {
            label = `Vectors ${count}`
            const uHi = stepRange(step, 'U', VECTOR_MAGNITUDE)?.[1] ?? 1
            params = { stride: 2, scale: (0.08 * diagonal) / Math.max(uHi, 1e-12) }
            field = 'U'
            component = VECTOR_MAGNITUDE
            break
          }
          case 'streamlines': {
            label = `Streamlines ${count}`
            const dy = max[1] - min[1]
            params = {
              p0: [center[0], min[1] + 0.1 * dy, center[2]],
              p1: [center[0], max[1] - 0.1 * dy, center[2]],
              seeds: 10,
            }
            field = 'U'
            component = VECTOR_MAGNITUDE
            break
          }
          case 'iso': {
            label = `Iso ${count}`
            const f = defaultField ?? 'p'
            const r = stepRange(step, f, component) ?? [0, 1]
            params = { value: (r[0] + r[1]) / 2, valueMin: r[0], valueMax: r[1] }
            field = f
            break
          }
        }

        // First derived object: fade the outer mesh so interior objects are
        // visible without the user hunting for the eye toggle.
        const hasDerived = state.items.some((i) => i.type !== 'mesh' && i.type !== 'patch')
        if (!hasDerived && meshItem?.visible && meshItem.opacity === 1) {
          state.updateItem(meshItem.id, { opacity: 0.15 })
        }

        state.addItem({
          id,
          type,
          label,
          visible: true,
          field,
          component,
          colormap: meshItem?.colormap ?? 'coolwarm',
          rangeMode: 'auto',
          manualRange: [0, 1],
          representation: 'surface',
          opacity: 1,
          params,
        })
      })()
    },
    [bounds, fields],
  )

  return {
    containerRef,
    compareContainerRef,
    engine,
    status,
    errorMessage,
    times,
    fields,
    bounds,
    hasTimeSeries: times.length > 1,
    converting,
    convertLog,
    convert,
    addDerivedItem,
    probe,
    probeAt,
    clearProbe,
    contextLost,
    retryContext,
  }
}

type ComputedItem =
  | {
      kind: 'poly'
      points: Float32Array
      polys?: Uint32Array
      lines?: Uint32Array
      scalars: Float32Array | null
    }
  | {
      kind: 'glyph'
      positions: Float32Array
      vectors: Float32Array
      scaleFactor: number
      scalars: Float32Array | null
    }

function fieldScalars(
  pointData: Record<string, VtkDataArray>,
  item: PipelineItem,
): Float32Array | null {
  const array = item.field ? pointData[item.field] : undefined
  return array ? extractComponent(array, item.component) : null
}

function computeItem(item: PipelineItem, step: LoadedStep): ComputedItem | null {
  const internal = step.internal
  const params = (item.params ?? {}) as Record<string, unknown>

  switch (item.type) {
    case 'mesh': {
      if (!internal || !step.surface) return null
      return {
        kind: 'poly',
        points: internal.points,
        polys: step.surface.polys,
        scalars: fieldScalars(internal.pointData, item),
      }
    }
    case 'patch': {
      const patch = item.patchName ? step.patches[item.patchName] : undefined
      if (!patch?.polys) return null
      return {
        kind: 'poly',
        points: patch.points,
        polys: patch.polys,
        scalars: fieldScalars(patch.pointData, item),
      }
    }
    case 'slice': {
      if (!internal?.cells) return null
      const tets = tetsFor(step)
      if (!tets) return null
      const surf = slicePlane(
        internal.points, internal.cells,
        params.origin as Vec3, params.normal as Vec3, tets,
      )
      const array = item.field ? internal.pointData[item.field] : undefined
      let scalars: Float32Array | null = null
      if (array) {
        const interp = interpolateField(array, surf)
        scalars = extractComponent(
          { name: array.name, numComponents: interp.numComponents, numTuples: surf.edgeA.length, data: interp.data },
          item.component,
        )
      }
      return { kind: 'poly', points: surf.points, polys: surf.polys, scalars }
    }
    case 'iso': {
      if (!internal?.cells || !item.field) return null
      const array = internal.pointData[item.field]
      if (!array) return null
      const tets = tetsFor(step)
      if (!tets) return null
      const base = extractComponent(array, item.component)
      const surf = isoSurface(internal.points, internal.cells, base, params.value as number, tets)
      const interp = interpolateField(array, surf)
      const scalars = extractComponent(
        { name: array.name, numComponents: interp.numComponents, numTuples: surf.edgeA.length, data: interp.data },
        item.component,
      )
      return { kind: 'poly', points: surf.points, polys: surf.polys, scalars }
    }
    case 'clip': {
      if (!internal?.cells) return null
      const kept = clipCells(internal.points, internal.cells, params.origin as Vec3, params.normal as Vec3)
      if (kept.types.length === 0) return null
      const surface = extractExternalSurface(internal.points, kept)
      return {
        kind: 'poly',
        points: internal.points,
        polys: surface.polys,
        scalars: fieldScalars(internal.pointData, item),
      }
    }
    case 'streamlines': {
      const U = internal?.pointData['U']
      if (!internal?.cells || !U) return null
      const tets = tetsFor(step)
      if (!tets) return null
      const seeds = makeLineSeeds(params.p0 as Vec3, params.p1 as Vec3, (params.seeds as number) || 10)
      const res = traceStreamlines(internal.points, internal.cells, U, seeds, {}, tets)
      if (res.lines.length === 0) return null
      return { kind: 'poly', points: res.points, lines: res.lines, scalars: res.scalars }
    }
    case 'glyphs': {
      const U = internal?.pointData['U']
      if (!internal || !U) return null
      const g = sampleVectorGlyphs(internal.points, U, (params.stride as number) || 1)
      return {
        kind: 'glyph',
        positions: g.positions,
        vectors: g.vectors,
        scaleFactor: (params.scale as number) || 1,
        scalars: g.magnitudes,
      }
    }
    default:
      return null
  }
}

export { VECTOR_MAGNITUDE }
