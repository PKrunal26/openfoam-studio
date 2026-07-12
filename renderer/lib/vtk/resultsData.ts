// Data layer for the Results tab: fetches foamToVTK output per time step,
// parses it, extracts the renderable surface, and caches everything so time
// scrubbing never re-reads from disk. Pure TypeScript (fetcher is injected),
// no vtk.js imports — unit-testable in node.

import { parseLegacyVtk, type ParsedVtkDataset } from './legacyVtkParser'
import { extractExternalSurface, type ExtractedSurface } from './surfaceExtract'
import { extractComponent, computeRange, type ComponentSelector } from './fieldStats'
import type { VtkSeries } from '@/lib/api'

export interface FieldInfo {
  name: string
  numComponents: number
}

export interface LoadedStep {
  time: number
  internal: ParsedVtkDataset | null
  /** External surface of the internal mesh (what the viewer renders). */
  surface: ExtractedSurface | null
  patches: Record<string, ParsedVtkDataset>
}

export type FileFetcher = (relPath: string) => Promise<string>

/** Bookkeeping arrays foamToVTK writes that are not physical fields. */
const HIDDEN_FIELDS = new Set(['cellID', 'patchID'])

/** [min, max] of a field component on one step's internal point data; null if absent. */
export function stepRange(
  step: LoadedStep,
  fieldName: string,
  component: ComponentSelector,
): [number, number] | null {
  const array = step.internal?.pointData[fieldName]
  if (!array) return null
  return computeRange(extractComponent(array, component))
}

export class ResultsDataSource {
  private steps = new Map<number, Promise<LoadedStep>>()
  private allTimeRanges = new Map<string, Promise<[number, number]>>()

  constructor(
    private readonly series: VtkSeries,
    private readonly fetchFile: FileFetcher,
  ) {}

  get times(): number[] {
    return this.series.times
  }

  get numSteps(): number {
    return this.series.steps.length
  }

  loadStep(index: number): Promise<LoadedStep> {
    const cached = this.steps.get(index)
    if (cached) return cached
    const promise = this.loadStepUncached(index)
    this.steps.set(index, promise)
    // Drop failed loads from the cache so a retry is possible.
    promise.catch(() => this.steps.delete(index))
    return promise
  }

  private async loadStepUncached(index: number): Promise<LoadedStep> {
    const stepInfo = this.series.steps[index]
    if (!stepInfo) throw new Error(`No VTK time step at index ${index}`)

    let internal: ParsedVtkDataset | null = null
    let surface: ExtractedSurface | null = null
    if (stepInfo.internal) {
      internal = parseLegacyVtk(await this.fetchFile(stepInfo.internal))
      if (internal.cells) surface = extractExternalSurface(internal.points, internal.cells)
    }

    const patches: Record<string, ParsedVtkDataset> = {}
    for (const [name, relPath] of Object.entries(stepInfo.patches)) {
      try {
        patches[name] = parseLegacyVtk(await this.fetchFile(relPath))
      } catch (err) {
        // A broken patch must not take down the whole step.
        // eslint-disable-next-line no-console
        console.warn(`Failed to load patch ${name} at t=${stepInfo.time}:`, err)
      }
    }

    return { time: stepInfo.time, internal, surface, patches }
  }

  /** Physical point-data fields available at a step (internal mesh, falling back to patches). */
  async fieldsAt(index: number): Promise<FieldInfo[]> {
    const step = await this.loadStep(index)
    const source = step.internal?.pointData ?? Object.values(step.patches)[0]?.pointData ?? {}
    return Object.values(source)
      .filter((a) => !HIDDEN_FIELDS.has(a.name))
      .map((a) => ({ name: a.name, numComponents: a.numComponents }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  /** Min/max of a field component across every time step (loads all steps once). */
  allTimeRange(fieldName: string, component: ComponentSelector): Promise<[number, number]> {
    const key = `${fieldName}:${component}`
    const cached = this.allTimeRanges.get(key)
    if (cached) return cached
    const promise = (async (): Promise<[number, number]> => {
      let lo = Infinity
      let hi = -Infinity
      for (let i = 0; i < this.numSteps; i++) {
        const range = stepRange(await this.loadStep(i), fieldName, component)
        if (!range) continue
        if (range[0] < lo) lo = range[0]
        if (range[1] > hi) hi = range[1]
      }
      if (lo === Infinity) return [0, 1]
      return [lo, hi]
    })()
    this.allTimeRanges.set(key, promise)
    promise.catch(() => this.allTimeRanges.delete(key))
    return promise
  }
}
