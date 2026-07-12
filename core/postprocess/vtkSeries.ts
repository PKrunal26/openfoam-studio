/**
 * Classification and time-series grouping of foamToVTK output files.
 *
 * Layouts handled (relPath is always relative to <case>/VTK, '/'-separated):
 *   OF Foundation 13 (legacy):  <patch>/<patch>_<time>.vtk   (POLYDATA)
 *                               <case>_<time>.vtk            (UNSTRUCTURED_GRID)
 *   Newer XML output:           <case>_<time>.vtm            (multiblock index)
 *                               <case>_<time>/internal.vtu   (cells)
 *                               <case>_<time>/boundary/<patch>.vtp
 *
 * With `foamToVTK -useTimeName` the suffix is the actual time value
 * ("0.5", "1e-05"); without it, the write index. Both parse as numbers.
 */

export type VtkFileKind = 'internalMesh' | 'patch' | 'multiblock' | 'other'

export interface VtkFileInfo {
  kind: VtkFileKind
  /** Actual time value (with -useTimeName) or write index; null if unparseable. */
  time: number | null
  patchName: string | null
}

export interface VtkSeriesStep {
  time: number
  /** relPath of the internal-mesh file for this step, if present */
  internal?: string
  /** patchName → relPath */
  patches: Record<string, string>
}

export interface VtkSeries {
  /** sorted ascending */
  times: number[]
  /** one entry per time, same order as `times` */
  steps: VtkSeriesStep[]
}

const NUMERIC = /^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/

/** Parses the `_<time>` suffix of a file or directory base name. */
function timeSuffix(baseName: string): number | null {
  const idx = baseName.lastIndexOf('_')
  if (idx < 0) return null
  const suffix = baseName.slice(idx + 1)
  if (!NUMERIC.test(suffix)) return null
  return Number(suffix)
}

function stripExt(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx < 0 ? name : name.slice(0, idx)
}

export function classifyVtkFile(relPath: string): VtkFileInfo {
  const segments = relPath.split('/')
  const fileName = segments[segments.length - 1]!
  const dotIdx = fileName.lastIndexOf('.')
  const ext = dotIdx < 0 ? '' : fileName.slice(dotIdx).toLowerCase()
  const base = stripExt(fileName)

  if (ext === '.vtm') {
    return { kind: 'multiblock', time: timeSuffix(base), patchName: null }
  }

  if (ext === '.vtu') {
    // <case>_<time>/internal.vtu — time lives on the parent directory.
    const parent = segments.length > 1 ? segments[segments.length - 2]! : ''
    return { kind: 'internalMesh', time: timeSuffix(parent), patchName: null }
  }

  if (ext === '.vtp') {
    // <case>_<time>/boundary/<patch>.vtp
    const timeDir = segments.find((s) => timeSuffix(s) != null || timeSuffix(stripExt(s)) != null)
    return {
      kind: 'patch',
      time: timeDir ? timeSuffix(stripExt(timeDir)) : null,
      patchName: base,
    }
  }

  if (ext === '.vtk') {
    if (segments.length > 1) {
      // <patch>/<patch>_<time>.vtk
      return { kind: 'patch', time: timeSuffix(base), patchName: segments[segments.length - 2]! }
    }
    return { kind: 'internalMesh', time: timeSuffix(base), patchName: null }
  }

  return { kind: 'other', time: null, patchName: null }
}

export function buildVtkSeries(relPaths: string[]): VtkSeries {
  const byTime = new Map<number, VtkSeriesStep>()

  for (const relPath of relPaths) {
    const info = classifyVtkFile(relPath)
    if (info.time == null) continue
    if (info.kind !== 'internalMesh' && info.kind !== 'patch') continue
    let step = byTime.get(info.time)
    if (!step) {
      step = { time: info.time, patches: {} }
      byTime.set(info.time, step)
    }
    if (info.kind === 'internalMesh') {
      step.internal = relPath
    } else if (info.patchName) {
      step.patches[info.patchName] = relPath
    }
  }

  const steps = [...byTime.values()].sort((a, b) => a.time - b.time)
  return { times: steps.map((s) => s.time), steps }
}
