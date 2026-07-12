// WebGL context guards shared by the two vtk.js viewers (Geometry + Results).
//
// vtk.js GenericRenderWindow has a sharp edge: when the GPU process drops the
// WebGL context (e.g. after a compute-heavy foamRun in the same Electron
// session), its `get3DContext` logs "no webgl context" and then runs
// `new Proxy(null, …)`, which throws
//   TypeError: Cannot create proxy with a non-object as target or handler
// With no error boundary that exception unmounts the whole React tree → black
// screen. These helpers let the viewers detect context loss *before* a render
// reaches that code path, and react to the canvas' own lost/restored events.

// Duck-typed shapes — we never import vtk.js types here so this module stays
// node-testable and decoupled from the engine.
interface CanvasLike {
  getContext: (...args: unknown[]) => unknown
  addEventListener: (type: string, cb: EventListenerOrEventListenerObject) => void
  removeEventListener: (type: string, cb: EventListenerOrEventListenerObject) => void
}

interface GrwLike {
  getApiSpecificRenderWindow?: () => unknown
}

function apiOf(grw: unknown): { getCanvas?: () => unknown; get3DContext?: () => unknown } | null {
  if (!grw) return null
  try {
    const api = (grw as GrwLike).getApiSpecificRenderWindow?.()
    return api && typeof api === 'object' ? (api as Record<string, () => unknown>) : null
  } catch {
    return null
  }
}

function isCanvasLike(value: unknown): value is CanvasLike {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as CanvasLike).getContext === 'function' &&
    typeof (value as CanvasLike).addEventListener === 'function'
  )
}

/** The <canvas> vtk.js renders into, or null if it can't be reached. */
export function getRenderingCanvas(grw: unknown): CanvasLike | null {
  const api = apiOf(grw)
  if (!api?.getCanvas) return null
  try {
    const canvas = api.getCanvas()
    return isCanvasLike(canvas) ? canvas : null
  } catch {
    return null
  }
}

/**
 * True only when vtk.js can hand back a live WebGL context. Crucially this
 * swallows the `new Proxy(null)` TypeError so the check itself can never blank
 * the app — a thrown context-probe is treated as "no usable context".
 */
export function hasUsable3DContext(grw: unknown): boolean {
  const api = apiOf(grw)
  if (!api?.get3DContext) return false
  try {
    const ctx = api.get3DContext()
    return ctx != null && typeof ctx === 'object'
  } catch {
    return false
  }
}

export interface ContextLossHandlers {
  onLost: () => void
  onRestored: () => void
}

/**
 * Listens for the canvas' own `webglcontextlost` / `webglcontextrestored`
 * events. `preventDefault()` on the lost event is required for the browser to
 * later emit `webglcontextrestored`. Returns a detach function; a null canvas
 * yields a safe no-op detach.
 */
export function attachContextLossListeners(
  canvas: CanvasLike | null,
  handlers: ContextLossHandlers,
): () => void {
  if (!canvas) return () => {}
  const onLost = (e: Event) => {
    e.preventDefault()
    handlers.onLost()
  }
  const onRestored = () => handlers.onRestored()
  canvas.addEventListener('webglcontextlost', onLost as EventListener)
  canvas.addEventListener('webglcontextrestored', onRestored as EventListener)
  return () => {
    canvas.removeEventListener('webglcontextlost', onLost as EventListener)
    canvas.removeEventListener('webglcontextrestored', onRestored as EventListener)
  }
}
