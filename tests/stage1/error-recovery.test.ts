/**
 * Stage 1 — ErrorRecovery unit tests
 *
 * No Docker. No network. Pure regex + logic tests.
 * These tests are written BEFORE the implementation (TDD).
 * They will fail with "cannot find module" until core/agent/ErrorRecovery.ts exists.
 */

import { describe, it, expect } from 'vitest'
import { diagnose } from '../../core/agent/ErrorRecovery.js'

// ── Sample log snippets ────────────────────────────────────────────────────

const BAD_BC_LOG = `
--> FOAM FATAL ERROR:
Unknown patchField type "fixedGradient" for field "U"

    Valid patchField types are:
    ...
`

const MISSING_PREF_LOG = `
--> FOAM FATAL ERROR:
No reference cell found for field p
`

const HIGH_COURANT_LOG = `
Courant Number mean: 0.112 max: 2.47
deltaT = 0.005
`

const UNKNOWN_ERROR_LOG = `
--> FOAM FATAL ERROR:
Something entirely unexpected went wrong
`

const MISSING_PHASEPROPS_LOG = `
Selecting solver incompressibleVoF
--> FOAM FATAL ERROR:
cannot find file "//cavity/constant/phaseProperties"
    From function ... readStream ...
FOAM exiting
`

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ErrorRecovery.diagnose', () => {
  it('returns bad BC fix for Unknown patchField type log', () => {
    const result = diagnose(BAD_BC_LOG, {
      '0/U': 'boundaryField { fixedWalls { type fixedGradient; } }',
      'system/blockMeshDict': 'boundary ( fixedWalls { type wall; faces (); } );',
    })
    expect(result).not.toBeNull()
    const r = result!
    const fix0 = r.fix[0]!
    expect(r.errorClass).toBe('bad-boundary-condition')
    expect(r.fix.length).toBeGreaterThan(0)
    expect(fix0.file).toBe('0/U')
    expect(fix0.oldValue).toBeTruthy()
    expect(fix0.newValue).toBeTruthy()
    expect(fix0.oldValue).not.toBe(fix0.newValue)
  })

  it('returns pRef fix for No reference cell found log', () => {
    const result = diagnose(MISSING_PREF_LOG, { 'system/fvSolution': 'PIMPLE\n{\n    nCorrectors 2;\n}\n' })
    expect(result).not.toBeNull()
    const r = result!
    const fix0 = r.fix[0]!
    expect(r.errorClass).toBe('missing-pressure-reference')
    expect(r.fix.length).toBeGreaterThan(0)
    expect(fix0.file).toBe('system/fvSolution')
    expect(fix0.newValue).toContain('pRefCell')
  })

  it('returns Courant fix when max Courant > 1', () => {
    const result = diagnose(HIGH_COURANT_LOG, { 'system/controlDict': 'deltaT 0.005;\n' })
    expect(result).not.toBeNull()
    const r = result!
    const fix0 = r.fix[0]!
    expect(r.errorClass).toBe('high-courant-number')
    expect(r.fix.length).toBeGreaterThan(0)
    expect(fix0.file).toBe('system/controlDict')
    expect(fix0.description).toContain('deltaT')
  })

  it('requires physical phase input rather than inventing phaseProperties', () => {
    const result = diagnose(MISSING_PHASEPROPS_LOG)
    expect(result?.errorClass).toBe('missing-phaseproperties')
    expect(result?.fix).toEqual([])
    expect(result?.description).toContain('surface tension')
  })

  it('does not turn a scalar-field boundary error into a velocity-wall edit', () => {
    const result = diagnose(BAD_BC_LOG.replace('field "U"', 'field "p"'), {
      '0/p': 'boundaryField { outlet { type fixedGradient; } }',
    })
    expect(result?.errorClass).toBe('bad-boundary-condition')
    expect(result?.fix).toEqual([])
  })

  it('does not guess a velocity-wall condition without mesh patch context', () => {
    expect(diagnose(BAD_BC_LOG)?.fix).toEqual([])
  })

  it('returns null for unknown error log', () => {
    const result = diagnose(UNKNOWN_ERROR_LOG)
    expect(result).toBeNull()
  })
})
