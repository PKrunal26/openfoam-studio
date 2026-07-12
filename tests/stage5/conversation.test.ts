/**
 * Stage 5 — Conversational followup test (F04)
 *
 * Verifies 3-turn conversation behaviour:
 *   Turn 1: full generation (8 files), Re=100 → nu=0.001
 *   Turn 2: refinement "Change Reynolds number to 400" → only physicalProperties, nu=0.00025
 *   Turn 3: refinement "Extend to 2 seconds" → only controlDict, endTime=2
 *
 * Prerequisites: claude CLI must be authenticated (uses Claude Code auth).
 * Expected runtime: ~60 seconds.
 */

import { describe, it, expect } from 'vitest'
import { FileGenerator } from '../../core/agent/FileGenerator.js'
import type { Message } from '../../core/agent/types.js'

const gen = new FileGenerator()

describe('Stage 5 — Conversational Followup (F04)', () => {

  it('Turn 1: generates all 8 files for Re=100', async () => {
    const prompt = 'Lid-driven cavity, Re=100, 2D, incompressible, run for 10 seconds'
    const files = await gen.generate(prompt)

    const keys = Object.keys(files)
    expect(keys).toContain('0/U')
    expect(keys).toContain('0/p')
    expect(keys).toContain('constant/physicalProperties')
    expect(keys).toContain('constant/momentumTransport')
    expect(keys).toContain('system/controlDict')
    expect(keys).toContain('system/fvSchemes')
    expect(keys).toContain('system/fvSolution')
    expect(keys).toContain('system/blockMeshDict')
    expect(keys.length).toBe(8)

    const nu = files['constant/physicalProperties']!
    const match = nu.match(/nu\s+([\d.eE+-]+)/)
    expect(match, 'physicalProperties must contain nu value').toBeTruthy()
    expect(parseFloat(match![1]!)).toBeCloseTo(0.001, 4)
  }, 180_000)

  it('Turn 2: refines to Re=400 — only physicalProperties changes', async () => {
    const history: Message[] = [
      {
        role: 'user',
        content: 'Lid-driven cavity, Re=100, 2D, incompressible, run for 10 seconds',
        timestamp: new Date().toISOString(),
      },
      {
        role: 'assistant',
        content: 'Generated 8 files for lid-driven cavity. Re=100, nu=0.001 m²/s, endTime=10s, deltaT=0.005s, mesh 20×20.',
        timestamp: new Date().toISOString(),
      },
    ]

    const files = await gen.generate('Change Reynolds number to 400', undefined, history)

    // Only physicalProperties should be returned
    const keys = Object.keys(files)
    expect(keys.length, `Expected 1 file, got: ${keys.join(', ')}`).toBe(1)
    expect(keys[0]).toContain('physicalProperties')

    // Re=400: nu = U*L/Re = 1 * 0.1 / 400 = 0.00025
    const nu = files['constant/physicalProperties']!
    const match = nu.match(/nu\s+([\d.eE+-]+)/)
    expect(match, 'physicalProperties must contain nu').toBeTruthy()
    expect(parseFloat(match![1]!)).toBeCloseTo(0.00025, 5)
  }, 120_000)

  it('Turn 3: extends endTime to 2s — only controlDict changes', async () => {
    const history: Message[] = [
      {
        role: 'user',
        content: 'Lid-driven cavity, Re=100, 2D, incompressible, run for 1 second',
        timestamp: new Date().toISOString(),
      },
      {
        role: 'assistant',
        content: 'Generated 8 files for lid-driven cavity. Re=100, nu=0.001 m²/s, endTime=1s, deltaT=0.005s, mesh 20×20.',
        timestamp: new Date().toISOString(),
      },
      {
        role: 'user',
        content: 'Change Reynolds number to 400',
        timestamp: new Date().toISOString(),
      },
      {
        role: 'assistant',
        content: 'Updated physicalProperties: Re=400, nu=0.00025 m²/s.',
        timestamp: new Date().toISOString(),
      },
    ]

    const files = await gen.generate('Extend simulation to 2 seconds', undefined, history)

    const keys = Object.keys(files)
    expect(keys.length, `Expected 1 file, got: ${keys.join(', ')}`).toBe(1)
    expect(keys[0]).toContain('controlDict')

    const cd = files['system/controlDict']!
    const match = cd.match(/endTime\s+([\d.]+)/)
    expect(match, 'controlDict must contain endTime').toBeTruthy()
    expect(parseFloat(match![1]!)).toBeCloseTo(2, 1)
  }, 120_000)

})
