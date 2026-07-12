import { useEffect, useRef, useState } from 'react'
import { Box, RefreshCw } from 'lucide-react'
import '@kitware/vtk.js/Rendering/Profiles/Geometry'
import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow'
import vtkXMLPolyDataReader from '@kitware/vtk.js/IO/XML/XMLPolyDataReader'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — vtk.js legacy reader is JS-only, no .d.ts shipped
import vtkLegacyPolyDataReader from '@kitware/vtk.js/IO/Legacy/PolyDataReader'
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor'
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper'
import { useProjectStore } from '@/store/useProjectStore'
import { getVtkManifest, vtkFileUrl, type VtkFile } from '@/lib/api'
import { ViewerErrorBoundary, ViewerUnavailable } from '@/components/ui/ViewerErrorBoundary'
import { attachContextLossListeners, getRenderingCanvas, hasUsable3DContext } from '@/lib/vtk/webgl'

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'ready'; patchCount: number; timeStep: number | null }
  | { kind: 'error'; message: string }

const PATCH_PALETTE = [
  [0.55, 0.78, 0.94], // blue
  [0.96, 0.71, 0.42], // amber
  [0.62, 0.86, 0.62], // green
  [0.95, 0.59, 0.66], // pink
  [0.78, 0.68, 0.95], // violet
  [0.96, 0.85, 0.45], // yellow
]

function patchLabel(relPath: string): string {
  const base = relPath.split('/').pop() ?? relPath
  // Strip extension and any trailing `_<time>` suffix that foamToVTK adds —
  // with -useTimeName the suffix can be fractional ("movingWall_0.5").
  return base.replace(/\.[^.]+$/, '').replace(/_[\d.eE+-]+$/, '')
}

export function GeometryTab() {
  return (
    <ViewerErrorBoundary>
      <GeometryTabInner />
    </ViewerErrorBoundary>
  )
}

function GeometryTabInner() {
  const project = useProjectStore((s) => s.project)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const grwRef = useRef<ReturnType<typeof vtkGenericRenderWindow.newInstance> | null>(null)
  const actorRefs = useRef<ReturnType<typeof vtkActor.newInstance>[]>([])
  const [state, setState] = useState<LoadState>({ kind: 'idle' })
  const [patches, setPatches] = useState<{ name: string; color: [number, number, number] }[]>([])
  const [reloadTick, setReloadTick] = useState(0)
  const [reinitTick, setReinitTick] = useState(0)
  const [contextLost, setContextLost] = useState(false)

  // Tear down + rebuild the render window, then reload the mesh into the fresh
  // context. Used by the fallback Retry button after a context loss.
  const retryContext = () => {
    setContextLost(false)
    setReinitTick((t) => t + 1)
    setReloadTick((t) => t + 1)
  }

  // One-time vtk.js render window setup, torn down on unmount.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const grw = vtkGenericRenderWindow.newInstance({ background: [0.07, 0.08, 0.1] })
    grw.setContainer(container)
    grw.resize()
    grwRef.current = grw

    // Watch for GPU-process context loss so a render can't throw and blank the
    // app; recover automatically when the browser restores it.
    const detach = attachContextLossListeners(getRenderingCanvas(grw), {
      onLost: () => setContextLost(true),
      onRestored: () => {
        setContextLost(false)
        setReinitTick((t) => t + 1)
        setReloadTick((t) => t + 1)
      },
    })
    if (!hasUsable3DContext(grw)) setContextLost(true)

    return () => {
      detach()
      actorRefs.current.forEach((a) => a.delete())
      actorRefs.current = []
      grw.delete()
      grwRef.current = null
    }
  }, [reinitTick])

  // Load mesh whenever the project changes (or user clicks Refresh).
  useEffect(() => {
    if (!project) return
    let cancelled = false
    const grw = grwRef.current
    if (!grw) return

    const load = async () => {
      setState({ kind: 'loading' })

      // Wipe previous actors before loading the new mesh.
      const renderer = grw.getRenderer()
      actorRefs.current.forEach((a) => {
        renderer.removeActor(a)
        a.delete()
      })
      actorRefs.current = []

      let manifest: VtkFile[] = []
      try {
        manifest = (await getVtkManifest(project.id)).files
      } catch (err) {
        if (!cancelled) {
          setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
        }
        return
      }

      // Pick the earliest time step (= the mesh from blockMesh) and only its
      // boundary patches. Internal cells (UNSTRUCTURED_GRID / .vtu) aren't
      // supported by vtk.js v35 (no XMLUnstructuredGridReader / GeometryFilter
      // shipped), but the boundary patches cover the surface and are rendered
      // below.
      const patchFiles = manifest.filter((f) => f.kind === 'patch')
      if (patchFiles.length === 0) {
        if (cancelled) return
        // Differentiate "nothing generated yet" from "mesh present but only as
        // unrenderable internal cells" — the latter happens with legacy
        // foamToVTK -ascii output (no boundary .vtp emitted).
        const hasLegacyInternal = manifest.some(
          (f) => f.kind === 'internalMesh' && f.ext === '.vtk',
        )
        const hasInternalMesh = manifest.some((f) => f.kind === 'internalMesh')
        if (hasLegacyInternal) {
          setState({
            kind: 'error',
            message:
              'Legacy ASCII mesh detected — re-run the case to regenerate XML output with boundary patches.',
          })
        } else if (hasInternalMesh) {
          setState({
            kind: 'error',
            message:
              'Internal mesh present but no boundary patches found. Try running foamToVTK again.',
          })
        } else {
          setState({ kind: 'empty' })
        }
        return
      }
      const minStep = patchFiles.reduce<number | null>((acc, f) => {
        if (f.time == null) return acc
        return acc == null ? f.time : Math.min(acc, f.time)
      }, null)
      const meshPatches = patchFiles.filter((f) => f.time === minStep || (minStep == null && f.time == null))

      const labels: { name: string; color: [number, number, number] }[] = []

      for (let i = 0; i < meshPatches.length; i++) {
        const p = meshPatches[i]!
        try {
          const res = await fetch(vtkFileUrl(project.id, p.relPath))
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
          if (cancelled) return
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let polyData: any
          if (p.ext === '.vtp') {
            const buf = await res.arrayBuffer()
            if (cancelled) return
            const reader = vtkXMLPolyDataReader.newInstance()
            reader.parseAsArrayBuffer(buf)
            polyData = reader.getOutputData(0)
          } else {
            // Legacy ASCII .vtk (OpenFOAM Foundation foamToVTK output).
            const text = await res.text()
            if (cancelled) return
            const reader = vtkLegacyPolyDataReader.newInstance()
            reader.parseAsText(text)
            polyData = reader.getOutputData(0)
          }
          const mapper = vtkMapper.newInstance()
          mapper.setInputData(polyData)
          const actor = vtkActor.newInstance()
          actor.setMapper(mapper)
          const color = PATCH_PALETTE[i % PATCH_PALETTE.length]!
          const prop = actor.getProperty()
          prop.setColor(color[0], color[1], color[2])
          prop.setEdgeVisibility(true)
          prop.setEdgeColor(0.15, 0.17, 0.2)
          prop.setLineWidth(1)
          renderer.addActor(actor)
          actorRefs.current.push(actor)
          labels.push({ name: patchLabel(p.relPath), color: [color[0]!, color[1]!, color[2]!] })
        } catch (err) {
          // Skip broken patches but keep going — partial geometry is still useful.
          // eslint-disable-next-line no-console
          console.warn(`Failed to load VTK patch ${p.relPath}:`, err)
        }
      }

      if (cancelled) return

      if (actorRefs.current.length === 0) {
        setState({ kind: 'empty' })
        return
      }

      renderer.resetCamera()
      try {
        grw.getRenderWindow().render()
      } catch (err) {
        // Transient WebGL context loss throws here (vtk.js `new Proxy(null)`).
        // Show the fallback instead of letting it bubble up and blank the app.
        // eslint-disable-next-line no-console
        console.error('vtk.js render failed (WebGL context likely lost):', err)
        if (!cancelled) setContextLost(true)
        return
      }
      setPatches(labels)
      setState({ kind: 'ready', patchCount: actorRefs.current.length, timeStep: minStep })
    }

    void load()
    return () => { cancelled = true }
  }, [project, reloadTick])

  // Resize observer — vtk.js needs an explicit resize on its container.
  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(() => {
      grwRef.current?.resize()
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Box className="h-3.5 w-3.5" />
          <span>Geometry</span>
          {state.kind === 'ready' && (
            <span className="text-[11px]">
              {state.patchCount} patch{state.patchCount === 1 ? '' : 'es'}
              {state.timeStep != null ? ` · t=${state.timeStep}` : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {patches.length > 0 && (
            <ul className="flex items-center gap-2">
              {patches.map((p) => (
                <li key={p.name} className="flex items-center gap-1 text-[11px]">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: `rgb(${Math.round(p.color[0] * 255)}, ${Math.round(p.color[1] * 255)}, ${Math.round(p.color[2] * 255)})` }}
                  />
                  <span>{p.name}</span>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setReloadTick((t) => t + 1)}
            className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 hover:bg-accent hover:text-foreground"
            title="Reload mesh"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {state.kind === 'loading' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            Loading mesh…
          </div>
        )}
        {state.kind === 'empty' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-xs text-muted-foreground">
            <div>
              <p>No mesh yet.</p>
              <p className="mt-1">Run blockMesh to generate geometry.</p>
            </div>
          </div>
        )}
        {state.kind === 'error' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-destructive">
            {state.message}
          </div>
        )}
        {!project && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            Open a project to view its geometry.
          </div>
        )}
        {contextLost && <ViewerUnavailable onRetry={retryContext} />}
      </div>
    </div>
  )
}
