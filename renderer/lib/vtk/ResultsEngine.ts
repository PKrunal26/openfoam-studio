// The single module that talks to vtk.js rendering for the Results tab.
// React components and stores never import vtk.js directly — they hold plain
// state and drive this engine through its imperative API. All vtk objects are
// created here and destroyed in dispose()/removeItem() so GPU memory cannot
// leak across tab closes or item deletes.

import '@kitware/vtk.js/Rendering/Profiles/Geometry'
// Registers the WebGL implementation of vtkGlyph3DMapper (vector glyphs).
import '@kitware/vtk.js/Rendering/Profiles/Glyph'
import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow'
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor'
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper'
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData'
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray'
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction'
import vtkColorMaps from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps'
import vtkScalarBarActor from '@kitware/vtk.js/Rendering/Core/ScalarBarActor'
import vtkAxesActor from '@kitware/vtk.js/Rendering/Core/AxesActor'
import vtkOrientationMarkerWidget from '@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget'
import vtkGlyph3DMapper from '@kitware/vtk.js/Rendering/Core/Glyph3DMapper'
import vtkArrowSource from '@kitware/vtk.js/Filters/Sources/ArrowSource'
import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker'
import { colormapPreset } from './colormaps'
import { attachContextLossListeners, getRenderingCanvas, hasUsable3DContext, type ContextLossHandlers } from './webgl'

export type RepresentationMode = 'surface' | 'surfaceEdges' | 'wireframe' | 'points'

export type CameraPreset = '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z' | 'iso'

export interface ItemGeometry {
  /** xyz interleaved */
  points: Float32Array
  /** vtk cell-array layout for polygon faces */
  polys?: Uint32Array
  /** vtk cell-array layout for polylines (streamlines etc.) */
  lines?: Uint32Array
}

export interface ItemDisplayProps {
  visible: boolean
  opacity: number
  representation: RepresentationMode
  colormap: string
  /** Color-mapping range for the scalars; ignored when scalars are null. */
  range: [number, number]
  /** One value per point; null renders the solid color instead. */
  scalars: Float32Array | null
  solidColor?: [number, number, number]
}

interface EngineItem {
  kind: 'poly' | 'glyph'
  actor: ReturnType<typeof vtkActor.newInstance>
  mapper: ReturnType<typeof vtkMapper.newInstance> | ReturnType<typeof vtkGlyph3DMapper.newInstance>
  polyData: ReturnType<typeof vtkPolyData.newInstance>
  ctf: ReturnType<typeof vtkColorTransferFunction.newInstance>
  /** glyph items only — the arrow source, owned by the engine */
  glyphSource?: ReturnType<typeof vtkArrowSource.newInstance>
}

const DARK_BG: [number, number, number] = [0.07, 0.08, 0.1]
const LIGHT_BG: [number, number, number] = [1, 1, 1]

/**
 * Mirrors camera movement between two viewports (compare mode). Returns an
 * unsubscribe function.
 */
export function syncCameras(a: ResultsEngine, b: ResultsEngine): () => void {
  const camA = a.getActiveCamera()
  const camB = b.getActiveCamera()
  if (!camA || !camB) return () => {}
  let busy = false
  const follow = (
    src: NonNullable<ReturnType<ResultsEngine['getActiveCamera']>>,
    dst: NonNullable<ReturnType<ResultsEngine['getActiveCamera']>>,
    dstEngine: ResultsEngine,
  ) => {
    if (busy) return
    busy = true
    dst.setPosition(...src.getPosition())
    dst.setFocalPoint(...src.getFocalPoint())
    dst.setViewUp(...src.getViewUp())
    dst.setViewAngle(src.getViewAngle())
    dstEngine.resetClippingRange()
    dstEngine.render()
    busy = false
  }
  const subA = camA.onModified(() => follow(camA, camB, b))
  const subB = camB.onModified(() => follow(camB, camA, a))
  follow(camA, camB, b)
  return () => {
    subA.unsubscribe()
    subB.unsubscribe()
  }
}

const CAMERA_PRESETS: Record<CameraPreset, { dir: [number, number, number]; up: [number, number, number] }> = {
  '+X': { dir: [1, 0, 0], up: [0, 0, 1] },
  '-X': { dir: [-1, 0, 0], up: [0, 0, 1] },
  '+Y': { dir: [0, 1, 0], up: [0, 0, 1] },
  '-Y': { dir: [0, -1, 0], up: [0, 0, 1] },
  '+Z': { dir: [0, 0, 1], up: [0, 1, 0] },
  '-Z': { dir: [0, 0, -1], up: [0, 1, 0] },
  iso: { dir: [0.577, 0.577, 0.577], up: [0, 0, 1] },
}

export class ResultsEngine {
  private grw: ReturnType<typeof vtkGenericRenderWindow.newInstance> | null = null
  private items = new Map<string, EngineItem>()
  private scalarBar: ReturnType<typeof vtkScalarBarActor.newInstance> | null = null
  private orientationWidget: ReturnType<typeof vtkOrientationMarkerWidget.newInstance> | null = null
  private detachContextListeners: (() => void) | null = null
  private onContextLost: (() => void) | null = null

  init(container: HTMLElement, contextHandlers?: ContextLossHandlers): void {
    if (this.grw) return
    const grw = vtkGenericRenderWindow.newInstance({ background: [...DARK_BG] })
    grw.setContainer(container)
    grw.resize()
    this.grw = grw

    // Surface GPU-process context loss to the React layer so it can show the
    // fallback instead of letting the next render throw and blank the app.
    if (contextHandlers) {
      this.onContextLost = contextHandlers.onLost
      this.detachContextListeners = attachContextLossListeners(
        getRenderingCanvas(grw),
        contextHandlers,
      )
    }

    const axes = vtkAxesActor.newInstance()
    const widget = vtkOrientationMarkerWidget.newInstance({
      actor: axes,
      interactor: grw.getRenderWindow().getInteractor(),
    })
    widget.setViewportCorner(vtkOrientationMarkerWidget.Corners.BOTTOM_RIGHT)
    widget.setViewportSize(0.13)
    widget.setEnabled(true)
    this.orientationWidget = widget

    const scalarBar = vtkScalarBarActor.newInstance()
    scalarBar.setDrawNanAnnotation(false)
    scalarBar.setVisibility(false)
    grw.getRenderer().addActor(scalarBar)
    this.scalarBar = scalarBar

    // Debug handle for the dev console; harmless in production.
    ;(window as unknown as Record<string, unknown>).__ofsResultsEngine = this
  }

  /** True only when vtk.js can hand back a live WebGL context. */
  hasUsableContext(): boolean {
    return hasUsable3DContext(this.grw)
  }

  dispose(): void {
    if (!this.grw) return
    this.detachContextListeners?.()
    this.detachContextListeners = null
    this.onContextLost = null
    for (const id of [...this.items.keys()]) this.removeItem(id)
    if (this.orientationWidget) {
      this.orientationWidget.setEnabled(false)
      this.orientationWidget.delete()
      this.orientationWidget = null
    }
    if (this.scalarBar) {
      this.grw.getRenderer().removeActor(this.scalarBar)
      this.scalarBar.delete()
      this.scalarBar = null
    }
    this.grw.delete()
    this.grw = null
  }

  resize(): void {
    this.grw?.resize()
  }

  render(): void {
    if (!this.grw) return
    try {
      this.grw.getRenderWindow().render()
    } catch (err) {
      // A transient context loss can throw here (vtk.js `new Proxy(null)`)
      // without a preceding `webglcontextlost` event. Route it to the same
      // fallback path instead of letting it bubble up and unmount the app.
      // eslint-disable-next-line no-console
      console.error('vtk.js render failed (WebGL context likely lost):', err)
      this.onContextLost?.()
    }
  }

  hasItem(id: string): boolean {
    return this.items.has(id)
  }

  /** Creates the item on first call; replaces its geometry afterwards. */
  setItemGeometry(id: string, geometry: ItemGeometry): void {
    if (!this.grw) return
    let item = this.items.get(id)
    if (item && item.kind !== 'poly') {
      this.removeItem(id)
      item = undefined
    }
    if (!item) {
      const polyData = vtkPolyData.newInstance()
      const mapper = vtkMapper.newInstance()
      mapper.setInputData(polyData)
      const actor = vtkActor.newInstance()
      actor.setMapper(mapper)
      const ctf = vtkColorTransferFunction.newInstance()
      this.grw.getRenderer().addActor(actor)
      item = { kind: 'poly' as const, actor, mapper, polyData, ctf }
      this.items.set(id, item)
    }
    item.polyData.getPoints().setData(geometry.points, 3)
    item.polyData.getPolys().setData(geometry.polys ?? new Uint32Array(0))
    item.polyData.getLines().setData(geometry.lines ?? new Uint32Array(0))
    item.polyData.modified()
  }

  /** Arrow glyphs oriented and scaled by a vector array at the given points. */
  setGlyphGeometry(
    id: string,
    positions: Float32Array,
    vectors: Float32Array,
    scaleFactor: number,
  ): void {
    if (!this.grw) return
    let item = this.items.get(id)
    if (item && item.kind !== 'glyph') {
      this.removeItem(id)
      item = undefined
    }
    if (!item) {
      const polyData = vtkPolyData.newInstance()
      const glyphSource = vtkArrowSource.newInstance()
      const mapper = vtkGlyph3DMapper.newInstance()
      mapper.setInputData(polyData, 0)
      mapper.setInputConnection(glyphSource.getOutputPort(), 1)
      mapper.setOrientationArray('vec')
      mapper.setScaleArray('vec')
      mapper.setScaleModeToScaleByMagnitude()
      const actor = vtkActor.newInstance()
      actor.setMapper(mapper)
      const ctf = vtkColorTransferFunction.newInstance()
      this.grw.getRenderer().addActor(actor)
      item = { kind: 'glyph' as const, actor, mapper, polyData, ctf, glyphSource }
      this.items.set(id, item)
    }
    item.polyData.getPoints().setData(positions, 3)
    item.polyData.getPointData().addArray(
      vtkDataArray.newInstance({ name: 'vec', values: vectors, numberOfComponents: 3 }),
    )
    ;(item.mapper as ReturnType<typeof vtkGlyph3DMapper.newInstance>).setScaleFactor(scaleFactor)
    item.polyData.modified()
  }

  setItemProps(id: string, props: ItemDisplayProps): void {
    const item = this.items.get(id)
    if (!item) return
    const { actor, mapper, polyData, ctf } = item

    actor.setVisibility(props.visible)
    const prop = actor.getProperty()
    prop.setOpacity(props.opacity)
    prop.setLineWidth(2)

    if (item.kind === 'glyph') {
      // Representation/edges are meaningless for glyph imposters.
      this.applyColoring(item, props)
      return
    }

    switch (props.representation) {
      case 'points':
        prop.setRepresentation(0)
        prop.setPointSize(3)
        prop.setEdgeVisibility(false)
        break
      case 'wireframe':
        prop.setRepresentation(1)
        prop.setEdgeVisibility(false)
        break
      case 'surfaceEdges':
        prop.setRepresentation(2)
        prop.setEdgeVisibility(true)
        prop.setEdgeColor(0.15, 0.17, 0.2)
        break
      default:
        prop.setRepresentation(2)
        prop.setEdgeVisibility(false)
    }

    this.applyColoring(item, props)
  }

  private applyColoring(item: EngineItem, props: ItemDisplayProps): void {
    const { mapper, polyData, ctf, actor } = item
    if (props.scalars) {
      polyData.getPointData().setScalars(
        vtkDataArray.newInstance({ name: 'scalars', values: props.scalars, numberOfComponents: 1 }),
      )
      ctf.applyColorMap(vtkColorMaps.getPresetByName(colormapPreset(props.colormap)))
      ctf.setMappingRange(props.range[0], props.range[1])
      ctf.updateRange()
      mapper.setLookupTable(ctf)
      mapper.setUseLookupTableScalarRange(true)
      mapper.setScalarVisibility(true)
      if (item.kind === 'poly') {
        ;(mapper as ReturnType<typeof vtkMapper.newInstance>).setInterpolateScalarsBeforeMapping(true)
      }
    } else {
      mapper.setScalarVisibility(false)
      const c = props.solidColor ?? [0.75, 0.78, 0.82]
      actor.getProperty().setColor(c[0], c[1], c[2])
    }
    polyData.modified()
  }

  removeItem(id: string): void {
    const item = this.items.get(id)
    if (!item) return
    this.grw?.getRenderer().removeActor(item.actor)
    item.actor.delete()
    item.mapper.delete()
    item.polyData.delete()
    item.ctf.delete()
    item.glyphSource?.delete()
    this.items.delete(id)
  }

  /** Binds the legend to an item's color function; pass null to hide it. */
  setScalarBar(itemId: string | null, title: string): void {
    if (!this.scalarBar) return
    const item = itemId ? this.items.get(itemId) : undefined
    if (!item) {
      this.scalarBar.setVisibility(false)
      return
    }
    this.scalarBar.setScalarsToColors(item.ctf)
    this.scalarBar.setAxisLabel(title)
    this.scalarBar.setVisibility(true)
  }

  setBackground(mode: 'dark' | 'light'): void {
    if (!this.grw) return
    const bg = mode === 'dark' ? DARK_BG : LIGHT_BG
    this.grw.getRenderer().setBackground(bg[0], bg[1], bg[2])
    // Keep the legend legible on both backgrounds.
    const text = mode === 'dark' ? 'white' : 'black'
    this.scalarBar?.setAxisTextStyle({ fontColor: text })
    this.scalarBar?.setTickTextStyle({ fontColor: text })
  }

  resetCamera(): void {
    if (!this.grw) return
    this.grw.getRenderer().resetCamera()
    this.fitToViewport()
    this.render()
  }

  // vtk.js resetCamera fits the bounding sphere to the *vertical* view angle
  // only — in a viewport narrower than tall the scene overflows horizontally.
  // Zoom out by the aspect ratio so the sphere fits both axes.
  private fitToViewport(): void {
    if (!this.grw) return
    const size = this.grw.getApiSpecificRenderWindow().getSize()
    const aspect = size[1] > 0 ? size[0] / size[1] : 1
    if (aspect < 1) this.grw.getRenderer().getActiveCamera().zoom(aspect)
  }

  setCameraPreset(preset: CameraPreset): void {
    if (!this.grw) return
    const renderer = this.grw.getRenderer()
    renderer.resetCamera()
    const cam = renderer.getActiveCamera()
    const fp = cam.getFocalPoint()
    const d = cam.getDistance()
    const { dir, up } = CAMERA_PRESETS[preset]
    cam.setPosition(fp[0] + dir[0] * d, fp[1] + dir[1] * d, fp[2] + dir[2] * d)
    cam.setViewUp(up[0], up[1], up[2])
    renderer.resetCamera()
    this.fitToViewport()
    renderer.resetCameraClippingRange()
    this.render()
  }

  /** World position of the surface under a client-space point, or null. */
  pickWorldPoint(
    clientX: number,
    clientY: number,
    container: HTMLElement,
  ): [number, number, number] | null {
    if (!this.grw) return null
    const rect = container.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const [w, h] = this.grw.getApiSpecificRenderWindow().getSize()
    const x = ((clientX - rect.left) / rect.width) * w
    const y = ((rect.height - (clientY - rect.top)) / rect.height) * h
    const picker = vtkCellPicker.newInstance()
    picker.setTolerance(0.005)
    picker.pick([x, y, 0], this.grw.getRenderer())
    const positions = picker.getPickedPositions() as number[][]
    const hit = positions[0]
    picker.delete()
    return hit ? [hit[0]!, hit[1]!, hit[2]!] : null
  }

  /** The viewport camera — used for two-viewport camera sync. */
  getActiveCamera() {
    return this.grw?.getRenderer().getActiveCamera() ?? null
  }

  resetClippingRange(): void {
    this.grw?.getRenderer().resetCameraClippingRange()
  }

  async screenshot(): Promise<string> {
    if (!this.grw) throw new Error('Viewer not initialised')
    this.render()
    const images = this.grw.getRenderWindow().captureImages('image/png')
    const first = images[0]
    if (!first) throw new Error('Screenshot capture failed')
    return first
  }
}
