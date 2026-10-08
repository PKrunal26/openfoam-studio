import { describe, expect, it } from 'vitest'
import { evaluateRunEvidence } from '../../../core/run/runEvidence.js'
const control = 'startTime 0;\nendTime 1;'
describe('full solver run evidence', () => {
  it('measures continuity and completion without certifying a generic conservation threshold', () => {
    const log = 'Time = 0.5\ntime step continuity errors : sum local = 1e-7, global = -2e-7, cumulative = -2e-7\nTime = 1\ntime step continuity errors : sum local = 0.1, global = 0.02, cumulative = 0.0199998\nEnd\n'
    expect(evaluateRunEvidence(log, control)).toMatchObject({ ok: true, advanced: true, completed: true, finalTime: 1, continuity: { finite: true, maxAbsGlobal: 0.02, observations: [{ time: 0.5, local: 1e-7, global: -2e-7, cumulative: -2e-7 }, { time: 1, local: 0.1, global: 0.02, cumulative: 0.0199998 }] } })
  })
  it('accepts Foundation 13 seconds suffixes and preserves missing cumulative observations', () => {
    const log = 'Time = 5s\ntime step continuity errors : sum local = 1e-7, global = -2e-7\nTime = 10s\ntime step continuity errors : sum local = 3e-7, global = 4e-7\ntime step continuity errors : sum local = 5e-7, global = 6e-7, cumulative = 4e-7\nEnd\n'
    expect(evaluateRunEvidence(log, 'startTime 0; endTime 10;')).toMatchObject({
      ok: true, finalTime: 10,
      continuity: { finite: true, maxAbsGlobal: 6e-7, observations: [
        { time: 5, local: 1e-7, global: -2e-7, cumulative: null },
        { time: 10, local: 3e-7, global: 4e-7, cumulative: null },
        { time: 10, local: 5e-7, global: 6e-7, cumulative: 4e-7 },
      ] },
    })
  })
  it.each(['1s', '1 s', '1.0e+0s', '+1.0s'])('accepts finite seconds time %s', time => {
    expect(evaluateRunEvidence(`Time = ${time}\nEnd\n`, control)).toMatchObject({ ok: true, finalTime: 1 })
  })
  it.each(['nan', 'nans', 'inf', '-Infinitys', '1e999s', '1ms', '1second', '0x1s', '', '1 s extra'])('rejects malformed or non-finite time %s', time => {
    const result = evaluateRunEvidence(`Time = ${time}\nEnd\n`, control)
    expect(result.ok).toBe(false)
    expect(result.finalTime).toBeNull()
  })
  it.each([
    'sum local = 0, global = nan',
    'sum local = 0, global = 1e999',
    'sum local = 0x0, global = 0',
    'sum local = 0, global = 0, cumulative = nan',
    'sum local = 0, global = 0, cumulative =',
    'sum local = 0, global = 0, cumulative = 0 trailing',
    'sum local = 0, global = 0, unexpected = 0',
    'sum local = 0, global = 0,',
    'sum local = , global = 0',
  ])('rejects incomplete or malformed continuity %s', values => {
    const result = evaluateRunEvidence(`Time = 1s\ntime step continuity errors : ${values}\nEnd\n`, control)
    expect(result.ok).toBe(false)
    expect(result.continuity.finite).toBe(false)
    expect(result.continuity.observations).toEqual([])
  })
  it.each([
    'sigFpe : Floating point exception trapping - not supported on this platform',
    'sigFpe : Enabling floating point exception trapping (FOAM_SIGFPE).',
  ])('accepts informational Foundation trapping header %s', header => {
    expect(evaluateRunEvidence(`${header}\nTime = 1s\nEnd\n`, control).ok).toBe(true)
  })
  it.each([
    'Floating point exception (core dumped)',
    'sigFpe : Floating point exception trapping - not supported on this platform (core dumped)',
    'sigFpe : Unexpected floating point exception',
    'Caught signal SIGFPE',
  ])('retains genuine numerical failure %s after an informational header', failure => {
    const result = evaluateRunEvidence(`sigFpe : Floating point exception trapping - not supported on this platform\nTime = 1s\n${failure}\nEnd\n`, control)
    expect(result.ok).toBe(false)
    expect(result.issues).toContain('Solver log contains a fatal error or non-finite numerical value')
  })
  it('rejects a premature process completion despite an End marker', () => {
    expect(evaluateRunEvidence('Time = 0.5\nEnd\n', control)).toMatchObject({ ok: false, advanced: true, completed: false })
  })
  it('rejects an End marker with no actual time advancement', () => {
    expect(evaluateRunEvidence('Time = 0\nEnd\n', control)).toMatchObject({ ok: false, advanced: false })
  })
  it('rejects missing completion markers and fatal errors after the last time', () => {
    expect(evaluateRunEvidence('Time = 1\n', control).ok).toBe(false)
    expect(evaluateRunEvidence('Time = 1\nFOAM FATAL IO ERROR\nEnd\n', control).ok).toBe(false)
  })
  it.each(['nan', 'inf', '-Infinity', '1e999'])('rejects non-finite continuity %s', value => {
    const result = evaluateRunEvidence(`Time = 1\ntime step continuity errors : sum local = 0, global = ${value}, cumulative = 0\nEnd\n`, control)
    expect(result.ok).toBe(false)
    expect(result.continuity.finite).toBe(false)
    expect(result.continuity.maxAbsGlobal).toBeNull()
  })
  it('distinguishes absent continuity evidence from measured zero continuity', () => {
    expect(evaluateRunEvidence('Time = 1\nEnd\n', control).continuity).toEqual({ observations: [], maxAbsGlobal: null, finite: true })
  })
  it('requires unique finite settings and ignores commented settings', () => {
    expect(evaluateRunEvidence('Time = 1\nEnd\n', '// endTime 99;\nstartTime 0; endTime 1;').ok).toBe(true)
    expect(evaluateRunEvidence('Time = 1\nEnd\n', 'startTime 0;\nendTime 1;\nendTime 2;').ok).toBe(false)
    expect(evaluateRunEvidence('Time = 1\nEnd\n', 'startTime 0; endTime 1; endTime 2;').ok).toBe(false)
  })
  it('allows roundoff at endTime but does not hide an absent final time step', () => {
    expect(evaluateRunEvidence('Time = 0.99999999999\nEnd\n', control).ok).toBe(true)
    expect(evaluateRunEvidence('Time = 0.999\nEnd\n', control).ok).toBe(false)
  })
})
