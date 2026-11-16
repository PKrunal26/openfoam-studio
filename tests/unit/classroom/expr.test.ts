import { describe, expect, it } from 'vitest'
import { evaluate, evaluateNumber, formatNumber, renderTemplate } from '../../../classroom/server/expr.js'

describe('classroom expression evaluator', () => {
  it('respects precedence, associativity and parentheses', () => {
    expect(evaluateNumber('1 + 2 * 3', {})).toBe(7)
    expect(evaluateNumber('(1 + 2) * 3', {})).toBe(9)
    expect(evaluateNumber('2 ^ 3 ^ 2', {})).toBe(512)
    expect(evaluateNumber('-2 ^ 2', {})).toBe(-4)
    expect(evaluateNumber('10 / 4 - 1', {})).toBe(1.5)
  })

  it('reads parameters and functions', () => {
    expect(evaluateNumber('U * L / nu', { U: 1, L: 0.1, nu: 0.01 })).toBeCloseTo(10)
    expect(evaluateNumber('round(8 * 1.5)', {})).toBe(12)
    expect(evaluateNumber('max(2, round(4 * 0.25))', {})).toBe(2)
    expect(evaluateNumber('if(Re > 47, 1, 0)', { Re: 100 })).toBe(1)
    expect(evaluateNumber('if(Re > 47, 1, 0)', { Re: 10 })).toBe(0)
    expect(evaluateNumber('sqrt(9.81 * 0.292)', {})).toBeCloseTo(1.6925, 3)
    expect(evaluateNumber('1.5 * (10 * 5 / 100)^2', {})).toBeCloseTo(0.375)
  })

  it('compares for constraints', () => {
    expect(evaluateNumber('steps <= 40000', { steps: 100 })).toBe(1)
    expect(evaluateNumber('Thot > Tcold', { Thot: 290, Tcold: 300 })).toBe(0)
    expect(evaluateNumber('a < 1 && b >= 2', { a: 0, b: 2 })).toBe(1)
  })

  it('passes a string parameter through only as a bare name', () => {
    expect(evaluate('scheme', { scheme: 'linearUpwind grad(U)' })).toBe('linearUpwind grad(U)')
    expect(() => evaluateNumber('scheme * 2', { scheme: 'upwind' })).toThrow(/not numeric/)
  })

  it('rejects anything outside the grammar', () => {
    expect(() => evaluate('process.exit(1)', {})).toThrow()
    expect(() => evaluate('constructor', {})).toThrow(/Unknown name/)
    expect(() => evaluate('toString()', {})).toThrow(/Unknown function/)
    expect(() => evaluate('1 +', {})).toThrow()
    expect(() => evaluate('1; 2', {})).toThrow()
    expect(() => evaluate('a[0]', { a: 1 })).toThrow()
    expect(() => evaluate('unknown + 1', {})).toThrow(/Unknown name/)
  })

  it('formats numbers the way OpenFOAM dictionaries expect', () => {
    expect(formatNumber(20)).toBe('20')
    expect(formatNumber(0.1 + 0.2)).toBe('0.3')
    expect(formatNumber(1e-5)).toBe('0.00001')
    expect(formatNumber(1e-7)).toBe('1e-7')
    expect(formatNumber(-9.81)).toBe('-9.81')
    expect(() => formatNumber(1 / 0)).toThrow()
  })

  it('renders every placeholder in a template', () => {
    const text = 'endTime {{endTime}};\nvalue uniform ({{U}} 0 0);\ndiv Gauss {{scheme}};\ng (0 {{-g}} 0);'
    expect(renderTemplate(text, { endTime: 0.5, U: 2, scheme: 'upwind', g: 9.81 }))
      .toBe('endTime 0.5;\nvalue uniform (2 0 0);\ndiv Gauss upwind;\ng (0 -9.81 0);')
    expect(() => renderTemplate('{{missing}}', {}, '0/U')).toThrow(/0\/U/)
  })
})
