import { describe, expect, it } from 'vitest'
import { extractFatalMessage, parseCellCount, parseConvergence, parseDatTable, parseTimeLine, thinIndices } from '../../../classroom/server/logParse.js'
import { thinTimes } from '../../../classroom/server/pipeline.js'

const LOG = `
Courant Number mean: 0.1 max: 0.5
Time = 0.005s

smoothSolver:  Solving for Ux, Initial residual = 1, Final residual = 1e-06, No Iterations 19
smoothSolver:  Solving for Uy, Initial residual = 0.5, Final residual = 1e-06, No Iterations 18
DICPCG:  Solving for p, Initial residual = 0.9, Final residual = 0.04, No Iterations 12
DICPCG:  Solving for p, Initial residual = 0.3, Final residual = 1e-07, No Iterations 30
diagonal:  Solving for rho, Initial residual = 0, Final residual = 0, No Iterations 0
Courant Number mean: 0.2 max: 0.85
Time = 0.01s

smoothSolver:  Solving for Ux, Initial residual = 0.16, Final residual = 1e-06, No Iterations 15
DICPCG:  Solving for p, Initial residual = 0.4, Final residual = 0.01, No Iterations 9
End
`

describe('classroom log parsing', () => {
  it('reads Foundation 13 time lines only', () => {
    expect(parseTimeLine('Time = 0.5s')).toBe(0.5)
    expect(parseTimeLine('Time = 143s')).toBe(143)
    expect(parseTimeLine('Time = 1e-05')).toBe(1e-5)
    expect(parseTimeLine('ExecutionTime = 3.1 s  ClockTime = 3 s')).toBeNull()
    expect(parseTimeLine('Time = nan')).toBeNull()
  })

  it('keeps the first residual of each field per step and drops all-zero fields', () => {
    const convergence = parseConvergence(LOG)
    expect(convergence.times).toEqual([0.005, 0.01])
    expect(convergence.residuals['Ux']).toEqual([1, 0.16])
    expect(convergence.residuals['p']).toEqual([0.9, 0.4])
    expect(convergence.residuals['Uy']).toEqual([0.5, null])
    expect(convergence.residuals).not.toHaveProperty('rho')
    expect(convergence.courantMax).toEqual([0.5, 0.85])
    expect(convergence.steps).toBe(2)
  })

  it('thins long histories but keeps the final step', () => {
    const log = Array.from({ length: 5000 }, (_, i) => `Time = ${i + 1}s\nGAMG:  Solving for p, Initial residual = ${1 / (i + 1)}, Final residual = 0, No Iterations 1`).join('\n')
    const convergence = parseConvergence(log, 100)
    expect(convergence.times.length).toBeLessThanOrEqual(101)
    expect(convergence.times[convergence.times.length - 1]).toBe(5000)
    expect(convergence.steps).toBe(5000)
    expect(parseConvergence('').times).toEqual([])
  })

  it('finds the cell count and the fatal message', () => {
    expect(parseCellCount('    faces:            1640\n    cells:            400\n')).toBe(400)
    expect(parseCellCount('nothing')).toBeNull()
    const fatal = '--> FOAM FATAL IO ERROR:\nkeyword UFinal is undefined in dictionary "/cavity/system/fvSolution/solvers"\n\nfile: /cavity/system/fvSolution/solvers from line 20 to line 30.\n'
    expect(extractFatalMessage(fatal)).toBe('keyword UFinal is undefined in dictionary "/cavity/system/fvSolution/solvers"')
    expect(extractFatalMessage('#0 Foam::sigFpe::sigHandler(int)\nFloating point exception (core dumped)')).toMatch(/diverged/)
    expect(extractFatalMessage('End')).toBeNull()
  })

  it('parses function-object tables', () => {
    const forces = '# Force coefficients\n# Aref        : 5.000000e-01\n# Time        \tCm            \tCd            \tCl            \n0             \t0\t4.96\t0.24\n0.01          \t0.01\t1.46\t-0.36\n'
    const table = parseDatTable(forces)
    expect(table['Time']).toEqual([0, 0.01])
    expect(table['Cd']).toEqual([4.96, 1.46])
    expect(table['Cl']).toEqual([0.24, -0.36])
    const average = parseDatTable('# Selection   : patch(inlet)\n# Time        \tareaAverage(p)\n1             \t1.280195e+02\n')
    expect(average['areaAverage(p)']).toEqual([128.0195])
    expect(parseDatTable('')).toEqual({})
  })

  it('thins indices and time lists evenly, keeping both ends', () => {
    expect(thinIndices(5, 10)).toEqual([0, 1, 2, 3, 4])
    const picked = thinIndices(1000, 10)
    expect(picked).toHaveLength(10)
    expect(picked[0]).toBe(0)
    expect(picked[9]).toBe(999)
    expect(thinTimes([1, 2, 3], 60)).toEqual([1, 2, 3])
    const times = thinTimes(Array.from({ length: 301 }, (_, i) => i), 60)
    expect(times).toHaveLength(60)
    expect(times[0]).toBe(0)
    expect(times[59]).toBe(300)
  })
})
