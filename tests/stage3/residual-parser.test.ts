/**
 * Stage 3 — Residual parser unit tests (no Docker required)
 *
 * Tests parseResiduals() in core/agent/ResidualParser.ts
 */

import { describe, it, expect } from 'vitest'
import { parseResiduals } from '../../core/agent/ResidualParser.js'

// ---------------------------------------------------------------------------
// Sample log fixtures
// ---------------------------------------------------------------------------

const SAMPLE_ICFOAM_LOG = `
Time = 0.005

smoothSolver:  Solving for Ux, Initial residual = 0.0823, Final residual = 1.23e-06, No Iterations 28
smoothSolver:  Solving for Uy, Initial residual = 0.0654, Final residual = 9.87e-07, No Iterations 25
GAMG:  Solving for p, Initial residual = 0.0512, Final residual = 4.56e-05, No Iterations 5

Time = 0.01

smoothSolver:  Solving for Ux, Initial residual = 0.0312, Final residual = 8.11e-07, No Iterations 22
smoothSolver:  Solving for Uy, Initial residual = 0.0198, Final residual = 6.44e-07, No Iterations 20
GAMG:  Solving for p, Initial residual = 0.0211, Final residual = 2.33e-05, No Iterations 4

Time = 0.015

smoothSolver:  Solving for Ux, Initial residual = 0.00145, Final residual = 3.21e-08, No Iterations 18
smoothSolver:  Solving for Uy, Initial residual = 0.00089, Final residual = 2.14e-08, No Iterations 16
GAMG:  Solving for p, Initial residual = 0.00312, Final residual = 1.11e-06, No Iterations 3
`

const GAMG_ONLY_LOG = `
Time = 0.005

GAMG:  Solving for p, Initial residual = 0.0512, Final residual = 4.56e-05, No Iterations 5

Time = 0.01

GAMG:  Solving for p, Initial residual = 0.0211, Final residual = 2.33e-05, No Iterations 4
`

const NO_SOLVER_LOG = `
/*---------------------------------------------------------------------------*\\
| =========                 |                                                 |
| \\      /  F ield         | OpenFOAM: The Open Source CFD Toolbox           |
|  \\    /   O peration     | Website:  https://openfoam.org                  |
Build  : 13-XXXXXXXXXX
Executive: foamRun
`

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ResidualParser — parseResiduals()', () => {

  it('extracts Ux, Uy, p from a sample icoFoam/foamRun log', () => {
    const result = parseResiduals(SAMPLE_ICFOAM_LOG)

    expect(Object.keys(result)).toEqual(expect.arrayContaining(['Ux', 'Uy', 'p']))

    // 3 time steps → 3 values per field
    expect(result['Ux']).toHaveLength(3)
    expect(result['Uy']).toHaveLength(3)
    expect(result['p']).toHaveLength(3)

    // First and last values should match the fixture
    expect(result['Ux']![0]).toBeCloseTo(0.0823, 4)
    expect(result['Ux']![2]).toBeCloseTo(0.00145, 5)

    expect(result['Uy']![0]).toBeCloseTo(0.0654, 4)
    expect(result['p']![0]).toBeCloseTo(0.0512, 4)
  })

  it('handles GAMG p lines (GAMG solver prefix instead of smoothSolver)', () => {
    const result = parseResiduals(GAMG_ONLY_LOG)

    expect(result['p']).toBeDefined()
    expect(result['p']).toHaveLength(2)
    expect(result['p']![0]).toBeCloseTo(0.0512, 4)
    expect(result['p']![1]).toBeCloseTo(0.0211, 4)
  })

  it('returns empty object for log with no solver lines', () => {
    const result = parseResiduals(NO_SOLVER_LOG)

    expect(result).toEqual({})
  })

})
