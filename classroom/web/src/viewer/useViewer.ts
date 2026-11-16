// Viewport orchestration for the classroom workbench. Owns one ResultsEngine
// (the desktop app's vtk.js wrapper) and turns a declarative "scene" into
// engine items:
//
//   geometry mode   boundary patches of the mesh, with the patches of the
//                   selected setting highlighted (like assigning faces in a
//                   CAD-based pre-processor)
//   results mode    the solution field on the mesh surface or on a cutting
//                   plane, optional velocity vectors, time stepping
//
// React components never touch vtk.js; they pass a scene and read `info`.

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { ResultsEngine } from '@/lib/vtk/ResultsEngine'
import { ResultsDataSource, type FieldInfo, type LoadedStep } from '@/lib/vtk/resultsData'
import { computeRange, extractComponent } from '@/lib/vtk/fieldStats'
import { interpolateField, slicePlane } from '@/lib/vtk/slice'
import { tetrahedralize } from '@/lib/vtk/tetrahedralize'
import { api, fetchVtkText, type TutorialDef } from '@c/api'
import type { DisplayState } from '@c/store'

type Vec3 = [number, number, number]

export interface ViewerScene {
  tutorial: TutorialDef
  mode: 'geometry' | 'results'
  runId: string
  hash: string
  highlight: string[]
  hidden: string[]
  display: DisplayState
}

export interface ViewerInfo {
  loading: boolean
  error: string | null
  contextLost: boolean
  times: number[]
  stepIndex: number
  fields: FieldInfo[]
  range: [number, number] | null
  points: number | null
  patches: string[]
  size: Vec3 | null
}

const EMPTY_INFO: ViewerInfo = {
  loading: false, error: null, contextLost: false, times: [], stepIndex: 0, fields: [], range: null, points: null, patches: [], size: null,
}

const BACKGROUND: Vec3 = [0.953, 0.957, 0.965]
const MODEL_COLOR: Vec3 = [0.22, 0.68, 0.93]
const DIM_COLOR: Vec3 = [0.86, 0.89, 0.92]
const FLAT_LIGHT = { ambient: 0.45, diffuse: 0.6 }
/** Field colors are shown unshaded so they match the legend exactly. */
const FIELD_LIGHT = { ambient: 1, diffuse: 0 }
const OUTLINE_COLOR: Vec3 = [0.62, 0.68, 0.74]
const ISO_VIEW: { dir: Vec3; up: Vec3 } = { dir: [0.55, 0.42, 0.72], up: [0, 1, 0] }
const FRONT_VIEW: { dir: Vec3; up: Vec3 } = { dir: [0, 0, 1], up: [0, 1, 0] }

// ── Data sources (shared across mounts so switching views does not refetch) ──

/**
 * `fields` loads only the volume mesh of each step (all the results view needs);
 * `geometry` also loads the boundary patches, and is only ever asked for one step.
 */
interface Source { fields: ResultsDataSource; geometry: ResultsDataSource; times: number[] }
const sources = new Map<string, Promise<Source>>()

function getSource(tutorialId: string, runId: string, hash: string): Promise<Source> {
  const key = `${tutorialId}/${runId}/${hash}`
  const cached = sources.get(key)
  if (cached) return cached
  const promise = api.manifest(tutorialId, runId).then((manifest) => {
    const fetchFile = (relPath: string) => fetchVtkText(tutorialId, runId, relPath, manifest.hash)
    const volumeOnly = { times: manifest.series.times, steps: manifest.series.steps.map((step) => ({ ...step, patches: {} })) }
    return { fields: new ResultsDataSource(volumeOnly, fetchFile), geometry: new ResultsDataSource(manifest.series, fetchFile), times: manifest.series.times }
  })
  sources.set(key, promise)
  promise.catch(() => sources.delete(key))
  if (sources.size > 6) sources.delete(sources.keys().next().value!)
  return promise
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

interface Bounds { min: Vec3; max: Vec3; diagonal: number }

function boundsOf(points: Float32Array): Bounds {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < points.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = points[i + a]!
      if (v < min[a]!) min[a] = v
      if (v > max[a]!) max[a] = v
    }
  }
  return { min, max, diagonal: Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1 }
}

function faceKeys(points: Float32Array, polys: Uint32Array, quantum: number, visit: (key: string, start: number, count: number) => void): void {
  for (let i = 0; i < polys.length;) {
    const n = polys[i]!
    let x = 0, y = 0, z = 0
    for (let j = 1; j <= n; j++) {
      const p = polys[i + j]! * 3
      x += points[p]!; y += points[p + 1]!; z += points[p + 2]!
    }
    visit(`${Math.round(x / n / quantum)},${Math.round(y / n / quantum)},${Math.round(z / n / quantum)}`, i, n)
    i += n + 1
  }
}

interface PatchGeometry { name: string; points: Float32Array; polys: Uint32Array }
const geometryCache = new WeakMap<LoadedStep, PatchGeometry[]>()

/**
 * Boundary patches as separate surfaces. foamToVTK does not export `empty`
 * patches (the front/back planes of 2D cases), so whatever part of the mesh
 * skin no exported patch covers is attributed to the tutorial's empty patch.
 */
function patchGeometries(step: LoadedStep, tutorial: TutorialDef): PatchGeometry[] {
  const cached = geometryCache.get(step)
  if (cached) return cached
  const out: PatchGeometry[] = []
  const covered = new Set<string>()
  const quantum = step.internal ? boundsOf(step.internal.points).diagonal * 1e-4 : 1e-6
  for (const [name, dataset] of Object.entries(step.patches)) {
    if (!dataset.polys) continue
    out.push({ name, points: dataset.points, polys: dataset.polys })
    faceKeys(dataset.points, dataset.polys, quantum, (key) => covered.add(key))
  }
  const emptyPatch = tutorial.geometry.patches.find((patch) => patch.kind === 'empty')
  if (step.internal && step.surface) {
    const rest: number[] = []
    const { points } = step.internal
    const { polys } = step.surface
    faceKeys(points, polys, quantum, (key, start, count) => {
      if (covered.has(key)) return
      for (let j = 0; j <= count; j++) rest.push(polys[start + j]!)
    })
    if (rest.length) out.push({ name: emptyPatch?.name ?? 'other', points, polys: Uint32Array.from(rest) })
  }
  geometryCache.set(step, out)
  return out
}

/** Area-weighted outward normal of a patch (boundary faces point out of the domain). */
function patchNormal(patch: PatchGeometry): Vec3 {
  const { points, polys } = patch
  const normal: Vec3 = [0, 0, 0]
  for (let i = 0; i < polys.length;) {
    const n = polys[i]!
    // Newell's method: robust for any planar polygon.
    for (let j = 0; j < n; j++) {
      const a = polys[i + 1 + j]! * 3
      const b = polys[i + 1 + ((j + 1) % n)]! * 3
      normal[0] += (points[a + 1]! - points[b + 1]!) * (points[a + 2]! + points[b + 2]!)
      normal[1] += (points[a + 2]! - points[b + 2]!) * (points[a]! + points[b]!)
      normal[2] += (points[a]! - points[b]!) * (points[a + 1]! + points[b + 1]!)
    }
    i += n + 1
  }
  return normal
}

const tetCache = new WeakMap<LoadedStep, Uint32Array>()
function tetsOf(step: LoadedStep): Uint32Array | null {
  if (!step.internal?.cells) return null
  let tets = tetCache.get(step)
  if (!tets) { tets = tetrahedralize(step.internal.cells).tets; tetCache.set(step, tets) }
  return tets
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface ViewerActions {
  fit: () => void
  view: (preset: 'iso' | 'front' | 'top' | 'side') => void
  zoom: (factor: number) => void
  screenshot: () => Promise<string | null>
}

export function useViewer(
  containerRef: RefObject<HTMLDivElement | null>,
  scene: ViewerScene | null,
  onAdvance: (nextStep: number) => void,
  /** Fraction of the viewport width covered by a panel on the left (0–0.8). */
  leftCover = 0,
): { info: ViewerInfo; actions: ViewerActions } {
  const engineRef = useRef<ResultsEngine | null>(null)
  const itemsRef = useRef(new Map<string, unknown>())
  const cameraKeyRef = useRef('')
  const sequenceRef = useRef(0)
  const advanceRef = useRef(onAdvance)
  advanceRef.current = onAdvance
  const coverRef = useRef(leftCover)
  coverRef.current = leftCover
  /** Fit factor: leave a margin and account for the covered part of the viewport. */
  const fitZoom = () => 0.9 * (1 - 0.75 * Math.min(0.8, Math.max(0, coverRef.current)))
  /** The fit factor currently baked into the camera, so a panel opening can rescale it. */
  const appliedFitRef = useRef(1)
  const [info, setInfo] = useState<ViewerInfo>(EMPTY_INFO)
  const [engineReady, setEngineReady] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const engine = new ResultsEngine()
    try {
      engine.init(container, {
        onLost: () => setInfo((current) => ({ ...current, contextLost: true })),
        onRestored: () => { setInfo((current) => ({ ...current, contextLost: false })); setEngineReady((n) => n + 1) },
      })
    } catch {
      setInfo({ ...EMPTY_INFO, contextLost: true })
      return
    }
    if (!engine.hasUsableContext()) {
      setInfo({ ...EMPTY_INFO, contextLost: true })
      engine.dispose()
      return
    }
    engine.setBackground(BACKGROUND)
    engineRef.current = engine
    itemsRef.current = new Map()
    cameraKeyRef.current = ''
    setEngineReady((n) => n + 1)
    const observer = new ResizeObserver(() => { engine.resize(); engine.render() })
    observer.observe(container)
    return () => {
      observer.disconnect()
      sequenceRef.current++
      engineRef.current = null
      engine.dispose()
    }
  }, [containerRef])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !scene) return
    const sequence = ++sequenceRef.current
    const stale = () => sequence !== sequenceRef.current || engineRef.current !== engine
    let timer: ReturnType<typeof setTimeout> | undefined

    /** Replace an item's geometry only when its source object changed. */
    const geometry = (id: string, source: unknown, build: () => { points: Float32Array; polys: Uint32Array }) => {
      if (itemsRef.current.get(id) === source && engine.hasItem(id)) return
      engine.setItemGeometry(id, build())
      itemsRef.current.set(id, source)
    }
    const keepOnly = (ids: Set<string>) => {
      for (const id of [...itemsRef.current.keys()]) {
        if (!ids.has(id)) { engine.removeItem(id); itemsRef.current.delete(id) }
      }
    }
    const camera = (key: string, view: { dir: Vec3; up: Vec3 }) => {
      if (cameraKeyRef.current === key) { engine.resetClippingRange(); engine.render(); return }
      cameraKeyRef.current = key
      engine.setView(view.dir, view.up)
      appliedFitRef.current = fitZoom()
      engine.zoom(appliedFitRef.current)
    }

    const apply = async () => {
      const { tutorial, display } = scene
      const source = await getSource(tutorial.id, scene.runId, scene.hash)
      if (stale()) return
      const numSteps = source.fields.numSteps
      if (!numSteps) throw new Error('This run has no exported time steps.')

      if (scene.mode === 'geometry') {
        const step = await source.geometry.loadStep(0)
        if (stale()) return
        const patches = patchGeometries(step, tutorial)
        const ids = new Set(patches.map((patch) => `patch:${patch.name}`))
        keepOnly(ids)
        const anyHighlight = scene.highlight.length > 0
        for (const patch of patches) {
          const id = `patch:${patch.name}`
          geometry(id, patch, () => ({ points: patch.points, polys: patch.polys }))
          const highlighted = scene.highlight.includes(patch.name)
          engine.setItemProps(id, {
            visible: !scene.hidden.includes(patch.name), opacity: 1,
            representation: display.edges ? 'surfaceEdges' : 'surface', colormap: display.colormap, range: [0, 1], scalars: null,
            solidColor: !anyHighlight || highlighted ? MODEL_COLOR : DIM_COLOR, lighting: FLAT_LIGHT,
          })
        }
        const bounds = step.internal ? boundsOf(step.internal.points) : null
        // Turn the model so the faces of the selected setting are not on the far side.
        const facing: Vec3 = [0, 0, 0]
        for (const patch of patches) {
          if (!scene.highlight.includes(patch.name)) continue
          const normal = patchNormal(patch)
          for (let a = 0; a < 3; a++) facing[a]! += normal[a]!
        }
        const magnitude = Math.hypot(facing[0], facing[1], facing[2])
        const flipX = magnitude > 0 && facing[0] / magnitude < -0.5
        const flipY = magnitude > 0 && facing[1] / magnitude < -0.5
        const view = { dir: [ISO_VIEW.dir[0] * (flipX ? -1 : 1), ISO_VIEW.dir[1] * (flipY ? -1 : 1), ISO_VIEW.dir[2]] as Vec3, up: ISO_VIEW.up }
        const orientation = `${flipX ? 'x' : ''}${flipY ? 'y' : ''}`
        // Keep the student's own rotation unless the selected faces would be hidden.
        const current = cameraKeyRef.current.startsWith(`${tutorial.id}:geometry:`) ? cameraKeyRef.current.split(':')[2] : null
        if (current === null || (magnitude > 0 && current !== orientation)) camera(`${tutorial.id}:geometry:${orientation}`, view)
        else { engine.resetClippingRange(); engine.render() }
        setInfo({
          ...EMPTY_INFO, times: source.times, patches: patches.map((patch) => patch.name), points: step.internal?.numPoints ?? null,
          size: bounds ? [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]] : null,
        })
        return
      }

      // ── results ──
      const stepIndex = display.stepIndex < 0 ? numSteps - 1 : Math.min(display.stepIndex, numSteps - 1)
      const step = await source.fields.loadStep(stepIndex)
      const fields = await source.fields.fieldsAt(stepIndex)
      if (stale()) return
      const internal = step.internal
      if (!internal || !step.surface) throw new Error('This time step has no volume data.')
      const array = internal.pointData[display.field] ?? internal.pointData[fields[0]?.name ?? '']
      if (!array) throw new Error('No fields were exported for this run.')
      const component = array.numComponents === 1 ? 0 : display.component
      const scalars = extractComponent(array, component)
      const bounds = boundsOf(internal.points)
      const use3dSlice = display.slice && tutorial.dimension === '3D'

      const draw = (range: [number, number]) => {
        const ids = new Set<string>()
        const common = { visible: true, colormap: display.colormap, range }
        if (use3dSlice) {
          const axis = display.sliceAxis
          const origin: Vec3 = [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, (bounds.min[2] + bounds.max[2]) / 2]
          const position = Math.min(0.995, Math.max(0.005, display.slicePosition))
          origin[axis] = bounds.min[axis]! + position * (bounds.max[axis]! - bounds.min[axis]!)
          const normal: Vec3 = [0, 0, 0]
          normal[axis] = 1
          const cut = slicePlane(internal.points, internal.cells!, origin, normal, tetsOf(step) ?? undefined)
          const cutValues = interpolateField({ ...array, data: scalars, numComponents: 1 }, cut).data
          engine.setItemGeometry('slice', { points: cut.points, polys: cut.polys })
          itemsRef.current.set('slice', cut)
          engine.setItemProps('slice', { ...common, opacity: 1, representation: 'surface', scalars: cutValues, lighting: FIELD_LIGHT })
          ids.add('slice')
          geometry('outline', step.surface, () => ({ points: internal.points, polys: step.surface!.polys }))
          engine.setItemProps('outline', { visible: true, opacity: 0.16, representation: 'surface', colormap: display.colormap, range, scalars: null, solidColor: OUTLINE_COLOR })
          ids.add('outline')
          if (display.vectors) {
            const velocity = internal.pointData['U']
            if (velocity && velocity.numComponents === 3) {
              const onCut = interpolateField(velocity, cut).data
              drawVectors(cut.points, onCut, bounds.diagonal)
              ids.add('vectors')
            }
          }
        } else {
          geometry('surface', step.surface, () => ({ points: internal.points, polys: step.surface!.polys }))
          engine.setItemProps('surface', { ...common, opacity: 1, representation: display.edges ? 'surfaceEdges' : 'surface', scalars, lighting: tutorial.dimension === '2D' ? FIELD_LIGHT : FLAT_LIGHT })
          ids.add('surface')
          if (display.vectors) {
            const velocity = internal.pointData['U']
            if (velocity && velocity.numComponents === 3) {
              drawVectors(internal.points, velocity.data as Float32Array, bounds.diagonal)
              ids.add('vectors')
            }
          }
        }
        keepOnly(ids)
      }

      const drawVectors = (points: Float32Array, vectors: Float32Array, diagonal: number) => {
        const count = points.length / 3
        // 2D slabs carry every point twice (front and back plane); keep the back one.
        const flat = tutorial.dimension === '2D'
        const zMid = (bounds.min[2] + bounds.max[2]) / 2
        const candidates: number[] = []
        for (let i = 0; i < count; i++) if (!flat || points[i * 3 + 2]! > zMid) candidates.push(i)
        const stride = Math.max(1, Math.ceil(candidates.length / 900))
        const picked = candidates.filter((_, index) => index % stride === 0)
        const positions = new Float32Array(picked.length * 3)
        const sampled = new Float32Array(picked.length * 3)
        let maxMagnitude = 0
        picked.forEach((pointIndex, k) => {
          for (let a = 0; a < 3; a++) {
            positions[k * 3 + a] = points[pointIndex * 3 + a]!
            sampled[k * 3 + a] = vectors[pointIndex * 3 + a]!
          }
          if (flat) positions[k * 3 + 2] = bounds.max[2] + diagonal * 0.002
          maxMagnitude = Math.max(maxMagnitude, Math.hypot(sampled[k * 3]!, sampled[k * 3 + 1]!, sampled[k * 3 + 2]!))
        })
        const spacing = diagonal / Math.sqrt(Math.max(1, picked.length))
        engine.setGlyphGeometry('vectors', positions, sampled, maxMagnitude > 0 ? (spacing * 1.6) / maxMagnitude : 1)
        itemsRef.current.set('vectors', sampled)
        engine.setItemProps('vectors', { visible: true, opacity: 1, representation: 'surface', colormap: display.colormap, range: [0, 1], scalars: null, solidColor: [0.09, 0.11, 0.14] })
      }

      const stepRange = computeRange(scalars)
      draw(stepRange)
      camera(`${tutorial.id}:results:${tutorial.dimension}`, tutorial.dimension === '2D' ? FRONT_VIEW : ISO_VIEW)
      const report = (range: [number, number], loading: boolean) => setInfo({
        ...EMPTY_INFO, loading, times: source.times, stepIndex, fields, range, points: internal.numPoints, patches: [],
        size: [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]],
      })
      let finalRange = stepRange
      if (display.rangeMode === 'all' && numSteps > 1) {
        report(stepRange, true)
        finalRange = await source.fields.allTimeRange(array.name, component)
        if (stale()) return
        draw(finalRange)
        engine.render()
      }
      report(finalRange, false)
      if (display.playing && numSteps > 1) {
        timer = setTimeout(() => { if (!stale()) advanceRef.current((stepIndex + 1) % numSteps) }, 160)
      }
    }

    setInfo((current) => ({ ...current, loading: true, error: null }))
    apply().catch((error: unknown) => {
      if (stale()) return
      for (const id of [...itemsRef.current.keys()]) engine.removeItem(id)
      itemsRef.current.clear()
      engine.render()
      setInfo({ ...EMPTY_INFO, error: error instanceof Error ? error.message : 'Could not load the results.' })
    })
    return () => { if (timer) clearTimeout(timer) }
    // The scene object is rebuilt every render; depend on its meaningful parts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    engineReady, scene?.tutorial.id, scene?.mode, scene?.runId, scene?.hash, scene?.highlight.join('|'), scene?.hidden.join('|'),
    scene?.display.field, scene?.display.component, scene?.display.colormap, scene?.display.rangeMode, scene?.display.edges,
    scene?.display.slice, scene?.display.sliceAxis, scene?.display.slicePosition, scene?.display.vectors, scene?.display.stepIndex,
    scene?.display.playing,
  ])

  // Keep the model centred in the area the left panel leaves free.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    const next = fitZoom()
    if (appliedFitRef.current > 0 && next !== appliedFitRef.current) engine.zoom(next / appliedFitRef.current)
    appliedFitRef.current = next
    engine.setImageShift(Math.min(0.8, Math.max(0, leftCover)), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftCover, engineReady])

  const fit = useCallback(() => { engineRef.current?.resetCamera(); appliedFitRef.current = fitZoom(); engineRef.current?.zoom(appliedFitRef.current) }, [])
  const view = useCallback((preset: 'iso' | 'front' | 'top' | 'side') => {
    const views: Record<string, { dir: Vec3; up: Vec3 }> = {
      iso: ISO_VIEW, front: FRONT_VIEW, top: { dir: [0, 1, 0], up: [0, 0, -1] }, side: { dir: [1, 0, 0], up: [0, 1, 0] },
    }
    engineRef.current?.setView(views[preset]!.dir, views[preset]!.up)
    appliedFitRef.current = fitZoom()
    engineRef.current?.zoom(appliedFitRef.current)
  }, [])
  const zoom = useCallback((factor: number) => engineRef.current?.zoom(factor), [])
  const screenshot = useCallback(async () => {
    try { return (await engineRef.current?.screenshot()) ?? null } catch { return null }
  }, [])

  return { info, actions: { fit, view, zoom, screenshot } }
}
