import { describe, it, expect } from 'vitest'
import { splitForExport } from '../../../classroom/server/pipeline'

const times = (count: number) => Array.from({ length: count }, (_, i) => `t${i}`)

describe('splitForExport', () => {
  it('keeps a short run in one piece — workers would cost more than they save', () => {
    expect(splitForExport(times(5), 3, 4)).toHaveLength(1)
  })

  it('splits a long run across workers', () => {
    const chunks = splitForExport(times(60), 3, 4)
    expect(chunks).toHaveLength(3)
    expect(chunks.flat()).toEqual(times(60))
  })

  it('covers every time step exactly once, in order', () => {
    const chunks = splitForExport(times(61), 4, 4)
    expect(chunks.flat()).toEqual(times(61))
    for (const chunk of chunks) expect(chunk.length).toBeGreaterThan(0)
  })

  it('never makes more workers than there is work for', () => {
    expect(splitForExport(times(9), 4, 4).length).toBeLessThanOrEqual(2)
  })

  it('one worker means one chunk', () => {
    expect(splitForExport(times(60), 1, 4)).toEqual([times(60)])
  })
})
