import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ResultsDataSource, stepRange } from '../../../renderer/lib/vtk/resultsData'
import { VECTOR_MAGNITUDE } from '../../../renderer/lib/vtk/fieldStats'
import type { VtkSeries } from '../../../renderer/lib/api'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = (rel: string) => path.join(here, '..', '..', 'fixtures', 'vtk', rel)

const SERIES: VtkSeries = {
  times: [10],
  steps: [
    {
      time: 10,
      internal: 'cavity_10.vtk',
      patches: {
        movingWall: 'movingWall/movingWall_10.vtk',
        fixedWalls: 'fixedWalls/fixedWalls_10.vtk',
      },
    },
  ],
}

function makeSource() {
  let fetchCount = 0
  const source = new ResultsDataSource(SERIES, async (relPath) => {
    fetchCount++
    return fs.readFileSync(fixturePath(relPath), 'utf8')
  })
  return { source, fetches: () => fetchCount }
}

describe('ResultsDataSource', () => {
  it('loads internal mesh, extracted surface, and patches for a step', async () => {
    const { source } = makeSource()
    const step = await source.loadStep(0)
    expect(step.time).toBe(10)
    expect(step.internal?.numPoints).toBe(882)
    expect(step.surface?.numFaces).toBe(880)
    expect(Object.keys(step.patches).sort()).toEqual(['fixedWalls', 'movingWall'])
  })

  it('caches steps — repeated loads do not re-fetch', async () => {
    const { source, fetches } = makeSource()
    await source.loadStep(0)
    const after = fetches()
    await source.loadStep(0)
    expect(fetches()).toBe(after)
  })

  it('lists point-data fields, hiding bookkeeping arrays', async () => {
    const { source } = makeSource()
    const fields = await source.fieldsAt(0)
    const names = fields.map((f) => f.name).sort()
    expect(names).toEqual(['U', 'epsilon', 'k', 'nut', 'p'])
    expect(fields.find((f) => f.name === 'U')!.numComponents).toBe(3)
  })

  it('computes the all-time range of a field', async () => {
    const { source } = makeSource()
    const [lo, hi] = await source.allTimeRange('U', VECTOR_MAGNITUDE)
    expect(lo).toBeGreaterThanOrEqual(0)
    // Lid velocity is 1 m/s — interior magnitudes stay below it.
    expect(hi).toBeGreaterThan(0.5)
    expect(hi).toBeLessThanOrEqual(1.05)
  })

  // A whole-run scan is one request per time step. Walking them one at a time
  // costs a full round trip per step: invisible on localhost, minutes long for
  // a student on a remote server, and it blocks the first animation frame.
  it('scans time steps concurrently, not one round trip at a time', async () => {
    const steps = Array.from({ length: 40 }, (_, i) => ({ time: i, internal: 'cavity_10.vtk', patches: {} }))
    const series: VtkSeries = { times: steps.map((step) => step.time), steps }
    let inFlight = 0
    let peakInFlight = 0
    const source = new ResultsDataSource(series, async (relPath) => {
      inFlight++
      peakInFlight = Math.max(peakInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight--
      return fs.readFileSync(fixturePath(relPath), 'utf8')
    })

    await source.allTimeRange('U', VECTOR_MAGNITUDE)

    expect(peakInFlight).toBeGreaterThan(1)
  })

  it('uses a server-computed range table instead of downloading every step', async () => {
    const steps = Array.from({ length: 30 }, (_, i) => ({ time: i, internal: 'cavity_10.vtk', patches: {} }))
    const series: VtkSeries = { times: steps.map((step) => step.time), steps }
    let fetches = 0
    const source = new ResultsDataSource(series, async (relPath) => {
      fetches++
      return fs.readFileSync(fixturePath(relPath), 'utf8')
    })
    source.useRangeTable({ U: { '-1': [0, 2] } })

    const range = await source.allTimeRange('U', VECTOR_MAGNITUDE)

    expect(range).toEqual([0, 2])
    expect(fetches).toBe(0)
    expect(source.settledAllTimeRange('U', VECTOR_MAGNITUDE)).toEqual([0, 2])
  })

  it('waits for the server table instead of racing it with a scan', async () => {
    const steps = Array.from({ length: 30 }, (_, i) => ({ time: i, internal: 'cavity_10.vtk', patches: {} }))
    const series: VtkSeries = { times: steps.map((step) => step.time), steps }
    let fetches = 0
    const source = new ResultsDataSource(series, async (relPath) => {
      fetches++
      return fs.readFileSync(fixturePath(relPath), 'utf8')
    })
    source.useRangeTableLoader(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      return { U: { '-1': [0, 3] } }
    })

    const range = await source.allTimeRange('U', VECTOR_MAGNITUDE)

    expect(range).toEqual([0, 3])
    expect(fetches).toBe(0)
  })

  it('scans when the server has no table for the run', async () => {
    const { source } = makeSource()
    source.useRangeTableLoader(async () => null)
    const [lo, hi] = await source.allTimeRange('U', VECTOR_MAGNITUDE)
    expect(hi).toBeGreaterThan(lo)
  })

  it('falls back to scanning for a field the table does not cover', async () => {
    const { source } = makeSource()
    source.useRangeTable({ other: { '0': [0, 1] } })
    const [lo, hi] = await source.allTimeRange('U', VECTOR_MAGNITUDE)
    expect(hi).toBeGreaterThan(lo)
  })

  it('prefetches steps ahead without being awaited, and only once each', async () => {
    const steps = Array.from({ length: 10 }, (_, i) => ({ time: i, internal: 'cavity_10.vtk', patches: {} }))
    const series: VtkSeries = { times: steps.map((step) => step.time), steps }
    const requested: number[] = []
    const source = new ResultsDataSource(series, async (relPath) => {
      requested.push(requested.length)
      return fs.readFileSync(fixturePath(relPath), 'utf8')
    })

    source.prefetch([2, 3, 4])
    source.prefetch([2, 3, 4])
    await source.loadStep(2)
    await source.loadStep(3)
    await source.loadStep(4)

    expect(requested.length).toBe(3)
  })

  it('keeps the cache inside its memory budget', async () => {
    const steps = Array.from({ length: 12 }, (_, i) => ({ time: i, internal: 'cavity_10.vtk', patches: {} }))
    const series: VtkSeries = { times: steps.map((step) => step.time), steps }
    let fetches = 0
    const source = new ResultsDataSource(series, async (relPath) => {
      fetches++
      return fs.readFileSync(fixturePath(relPath), 'utf8')
    }, { cacheBudgetBytes: 1 })

    for (let i = 0; i < 12; i++) await source.loadStep(i)
    const afterFirstPass = fetches
    await source.loadStep(0)

    // A budget of one byte keeps only the newest step, so step 0 is gone.
    expect(fetches).toBe(afterFirstPass + 1)
  })
})

describe('stepRange', () => {
  it('range of U magnitude on the loaded step is physical', async () => {
    const { source } = makeSource()
    const step = await source.loadStep(0)
    const [lo, hi] = stepRange(step, 'U', VECTOR_MAGNITUDE)!
    expect(lo).toBeGreaterThanOrEqual(0)
    expect(hi).toBeLessThanOrEqual(1.05)
  })

  it('returns null for unknown fields', async () => {
    const { source } = makeSource()
    const step = await source.loadStep(0)
    expect(stepRange(step, 'nope', 0)).toBeNull()
  })
})
