import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeFieldRanges, rangeFromTable } from '../../../classroom/server/fieldRanges'
import { ResultsDataSource } from '../../../renderer/lib/vtk/resultsData'
import { VECTOR_MAGNITUDE } from '../../../renderer/lib/vtk/fieldStats'
import type { VtkSeries } from '../../../renderer/lib/api'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = (rel: string) => path.join(here, '..', '..', 'fixtures', 'vtk', rel)
const readStep = (relPath: string) => fs.readFileSync(fixturePath(relPath), 'utf8')

const SERIES: VtkSeries = {
  times: [10, 20],
  steps: [
    { time: 10, internal: 'cavity_10.vtk', patches: {} },
    { time: 20, internal: 'cavity_10.vtk', patches: {} },
  ],
}

describe('computeFieldRanges', () => {
  it('matches what a client-side whole-run scan would produce', async () => {
    const table = await computeFieldRanges(SERIES, readStep)
    const source = new ResultsDataSource(SERIES, async (rel) => readStep(rel))

    const scanned = await source.allTimeRange('U', VECTOR_MAGNITUDE)
    const served = rangeFromTable(table, 'U', VECTOR_MAGNITUDE)

    expect(served).not.toBeNull()
    expect(served![0]).toBeCloseTo(scanned[0], 5)
    expect(served![1]).toBeCloseTo(scanned[1], 5)
  })

  it('covers every component of a vector field and the scalars', async () => {
    const table = await computeFieldRanges(SERIES, readStep)
    expect(rangeFromTable(table, 'U', VECTOR_MAGNITUDE)).not.toBeNull()
    expect(rangeFromTable(table, 'U', 0)).not.toBeNull()
    expect(rangeFromTable(table, 'U', 1)).not.toBeNull()
    expect(rangeFromTable(table, 'U', 2)).not.toBeNull()
    expect(rangeFromTable(table, 'p', 0)).not.toBeNull()
  })

  it('leaves out bookkeeping arrays', async () => {
    const table = await computeFieldRanges(SERIES, readStep)
    expect(table['cellID']).toBeUndefined()
  })

  it('returns null for a field it has no entry for', async () => {
    const table = await computeFieldRanges(SERIES, readStep)
    expect(rangeFromTable(table, 'nope', 0)).toBeNull()
  })
})
