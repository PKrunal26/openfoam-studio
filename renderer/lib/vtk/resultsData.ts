// Data layer for the Results tab: fetches foamToVTK output per time step,
// parses it, extracts the renderable surface, and caches everything so time
// scrubbing never re-reads from disk. Pure TypeScript (fetcher is injected),
// no vtk.js imports — unit-testable in node.

import { parseLegacyVtk, type ParsedVtkDataset } from './legacyVtkParser'
import { extractExternalSurface, type ExtractedSurface } from './surfaceExtract'
import { extractComponent, computeRange, HIDDEN_FIELDS, type ComponentSelector } from './fieldStats'
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

/** Time steps fetched at once when scanning a whole run for its field range. */
const STEP_SCAN_CONCURRENCY = 6

/** Steps warmed at once ahead of the playhead. Kept below the scan width so
 *  prefetching never outbids the frame the student is waiting to see. */
const PREFETCH_CONCURRENCY = 3

/** Parsed steps held in memory per run before the oldest are dropped. A 60-step
 *  2D run measures about 75 MB; 3D runs are heavier, and several runs can be
 *  open at once, so the cache is capped rather than unbounded. */
const DEFAULT_CACHE_BUDGET_BYTES = 256 * 1024 * 1024

/** field name → component selector as a string → [min, max] over the whole run. */
export type FieldRangeTable = Record<string, Record<string, [number, number]>>

export interface ResultsDataOptions {
  /** Bytes of parsed step data to keep per run. */
  cacheBudgetBytes?: number
}

function arrayBytes(array: { data: ArrayLike<number> }): number {
  const data = array.data as { byteLength?: number; length: number }
  return data.byteLength ?? data.length * 8
}

/** Rough size of a parsed step: points, fields and the extracted surface. */
function stepBytes(step: LoadedStep): number {
  let bytes = 0
  const dataset = step.internal
  if (dataset) {
    bytes += dataset.points.byteLength
    for (const array of Object.values(dataset.pointData)) bytes += arrayBytes(array)
    for (const array of Object.values(dataset.cellData)) bytes += arrayBytes(array)
    if (dataset.cells) bytes += dataset.cells.connectivity.byteLength + dataset.cells.offsets.byteLength + dataset.cells.types.byteLength
  }
  if (step.surface) {
    for (const value of Object.values(step.surface)) {
      if (ArrayBuffer.isView(value)) bytes += value.byteLength
    }
  }
  for (const patch of Object.values(step.patches)) {
    bytes += patch.points.byteLength
    for (const array of Object.values(patch.pointData)) bytes += arrayBytes(array)
  }
  return bytes
}

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
  private loaded = new Map<number, LoadedStep>()
  private allTimeRanges = new Map<string, Promise<[number, number]>>()
  private settledRanges = new Map<string, [number, number]>()

  private prefetching = 0
  private cachedBytes = 0
  private rangeTableLoader: (() => Promise<FieldRangeTable | null>) | null = null
  private rangeTablePromise: Promise<FieldRangeTable | null> | null = null
  private readonly cacheBudgetBytes: number

  constructor(
    private readonly series: VtkSeries,
    private readonly fetchFile: FileFetcher,
    options: ResultsDataOptions = {},
  ) {
    this.cacheBudgetBytes = options.cacheBudgetBytes ?? DEFAULT_CACHE_BUDGET_BYTES
  }

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
    promise.then(
      (step) => {
        this.loaded.set(index, step)
        this.cachedBytes += stepBytes(step)
        this.evictToBudget(index)
      },
      // Drop failed loads from the cache so a retry is possible.
      () => this.steps.delete(index),
    )
    return promise
  }

  /**
   * Warm steps the student is about to watch. Fire and forget: playback must
   * never wait on it, and the frame being drawn keeps its share of the
   * connection because only a few prefetches run at a time.
   */
  prefetch(indices: number[]): void {
    for (const index of indices) {
      if (this.prefetching >= PREFETCH_CONCURRENCY) return
      if (index < 0 || index >= this.numSteps || this.steps.has(index)) continue
      this.prefetching++
      void this.loadStep(index).catch(() => undefined).finally(() => { this.prefetching-- })
    }
  }

  /** Drop the least recently loaded steps until the cache fits its budget. */
  private evictToBudget(keepIndex: number): void {
    for (const [index, step] of this.loaded) {
      if (this.cachedBytes <= this.cacheBudgetBytes) return
      if (index === keepIndex) continue
      this.cachedBytes -= stepBytes(step)
      this.loaded.delete(index)
      this.steps.delete(index)
    }
  }

  /**
   * Range over the steps already in memory, or null if none are. The viewer
   * colours by this while a whole-run scan is still in flight, so playback
   * never waits for every step to arrive.
   */
  loadedRange(fieldName: string, component: ComponentSelector): [number, number] | null {
    let lo = Infinity
    let hi = -Infinity
    for (const step of this.loaded.values()) {
      const range = stepRange(step, fieldName, component)
      if (!range) continue
      if (range[0] < lo) lo = range[0]
      if (range[1] > hi) hi = range[1]
    }
    return lo === Infinity ? null : [lo, hi]
  }

  /** The finished whole-run range, if the scan has already completed. */
  settledAllTimeRange(fieldName: string, component: ComponentSelector): [number, number] | null {
    return this.settledRanges.get(`${fieldName}:${component}`) ?? null
  }

  /**
   * Adopt ranges the server computed for this run. The whole-run scale then
   * costs nothing: no step is downloaded for it. Fields the table does not
   * cover still fall back to scanning.
   */
  /**
   * Where to get the server's range table when the manifest did not carry it.
   * A whole-run scale waits for this rather than racing it with a scan that
   * would download the entire run.
   */
  useRangeTableLoader(loader: () => Promise<FieldRangeTable | null>): void {
    this.rangeTableLoader = loader
  }

  private async servedRange(fieldName: string, component: ComponentSelector): Promise<[number, number] | null> {
    if (!this.rangeTableLoader) return null
    this.rangeTablePromise ??= this.rangeTableLoader()
      .then((table) => { if (table) this.useRangeTable(table); return table })
      .catch(() => null)
    const table = await this.rangeTablePromise
    return table?.[fieldName]?.[String(component)] ?? null
  }

  useRangeTable(table: FieldRangeTable): void {
    for (const [fieldName, byComponent] of Object.entries(table)) {
      for (const [component, range] of Object.entries(byComponent)) {
        const key = `${fieldName}:${component}`
        if (this.settledRanges.has(key)) continue
        this.settledRanges.set(key, range)
        this.allTimeRanges.set(key, Promise.resolve(range))
      }
    }
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

  /**
   * Min/max of a field component across every time step. Served by the
   * server's table when there is one; otherwise every step is loaded once.
   */
  allTimeRange(fieldName: string, component: ComponentSelector): Promise<[number, number]> {
    const key = `${fieldName}:${component}`
    const cached = this.allTimeRanges.get(key)
    if (cached) return cached
    const promise = (async (): Promise<[number, number]> => {
      const served = await this.servedRange(fieldName, component)
      if (served) return served
      let lo = Infinity
      let hi = -Infinity
      // One request per step, so a serial walk costs a full round trip per
      // step — fine on localhost, minutes for a student on a remote server.
      // Keep a few in flight at once; more than this only queues in the browser.
      let next = 0
      const worker = async (): Promise<void> => {
        for (let i = next++; i < this.numSteps; i = next++) {
          const range = stepRange(await this.loadStep(i), fieldName, component)
          if (!range) continue
          if (range[0] < lo) lo = range[0]
          if (range[1] > hi) hi = range[1]
        }
      }
      const workers = Math.min(STEP_SCAN_CONCURRENCY, this.numSteps)
      await Promise.all(Array.from({ length: workers }, () => worker()))
      if (lo === Infinity) return [0, 1]
      return [lo, hi]
    })()
    this.allTimeRanges.set(key, promise)
    promise.then(
      (range) => this.settledRanges.set(key, range),
      () => this.allTimeRanges.delete(key),
    )
    return promise
  }
}
