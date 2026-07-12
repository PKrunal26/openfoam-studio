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
