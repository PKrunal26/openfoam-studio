import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { changedParams, loadCatalog, renderCase, resolveParams, validateOverride } from '../../../classroom/server/tutorials.js'

const catalog = loadCatalog(path.resolve(__dirname, '../../../classroom/tutorials'))
const cavity = catalog.get('cavity')!

describe('classroom tutorial catalog', () => {
  it('loads every shipped tutorial in order', () => {
    expect([...catalog.keys()]).toEqual(['cavity', 'backward-step', 'dam-break', 't-junction', 'cylinder', 'heated-cavity'])
    for (const tutorial of catalog.values()) {
      expect(tutorial.guide.length).toBeGreaterThan(500)
      expect(tutorial.templates.has('system/controlDict')).toBe(true)
    }
  })

  it('renders a policy-clean case with no placeholders left for every tutorial', () => {
    for (const tutorial of catalog.values()) {
      const rendered = renderCase(tutorial, resolveParams(tutorial))
      for (const [relPath, content] of rendered.files) {
        expect(content, `${tutorial.def.id}/${relPath}`).not.toMatch(/\{\{|\}\}/)
        expect(content.endsWith('\n')).toBe(true)
        expect(content).not.toContain('\r')
      }
      expect(rendered.endTime).toBeGreaterThan(0)
    }
  })

  it('uses defaults and computes derived values', () => {
    const resolved = resolveParams(cavity)
    expect(resolved.values['Ulid']).toBe(1)
    expect(resolved.derived['Re']).toBeCloseTo(10)
    expect(resolved.derived['Co']).toBeCloseTo(1)
    expect(resolved.issues).toEqual([])
  })

  it('rejects out-of-range numbers and unknown options, keeping the default', () => {
    const resolved = resolveParams(cavity, { Ulid: 1e9, N: 33, convection: 'Gauss; #codeStream' })
    expect(resolved.values['Ulid']).toBe(1)
    expect(resolved.values['N']).toBe(20)
    expect(resolved.values['convection']).toBe('linear')
    expect(resolved.issues.filter(issue => issue.level === 'error').map(issue => issue.param).sort()).toEqual(['N', 'Ulid', 'convection'])
  })

  it('accepts numeric strings from forms and ignores undeclared keys', () => {
    const resolved = resolveParams(cavity, { nu: '0.001', hack: '{{x}}' })
    expect(resolved.values['nu']).toBe(0.001)
    expect(resolved.values).not.toHaveProperty('hack')
    expect(resolved.derived['Re']).toBeCloseTo(100)
  })

  it('warns about a Courant number above one and blocks runaway step counts', () => {
    expect(resolveParams(cavity, { N: 40 }).issues).toEqual([expect.objectContaining({ level: 'warning' })])
    const tooLong = resolveParams(cavity, { endTime: 20, deltaT: 0.0001 })
    expect(tooLong.issues.some(issue => issue.level === 'error')).toBe(true)
  })

  it('writes parameter values into the dictionaries', () => {
    const rendered = renderCase(cavity, resolveParams(cavity, { Ulid: 2, nu: 0.002, N: 40, convection: 'upwind' }))
    expect(rendered.files.get('0/U')).toContain('uniform (2 0 0)')
    expect(rendered.files.get('constant/physicalProperties')).toContain('nu              0.002 [m^2/s];')
    expect(rendered.files.get('system/blockMeshDict')).toContain('(40 40 1)')
    expect(rendered.files.get('system/fvSchemes')).toContain('div(phi,U)      Gauss upwind;')
  })

  it('hashes by content: same settings match, any change differs', () => {
    const a = renderCase(cavity, resolveParams(cavity))
    const b = renderCase(cavity, resolveParams(cavity, { Ulid: 1 }))
    const c = renderCase(cavity, resolveParams(cavity, { Ulid: 1.5 }))
    expect(a.hash).toBe(b.hash)
    expect(a.hash).not.toBe(c.hash)
    expect(a.hash).toMatch(/^[0-9a-f]{40}$/)
    const other = catalog.get('heated-cavity')!
    expect(renderCase(other, resolveParams(other)).hash).not.toBe(a.hash)
  })

  it('reports only the settings a student changed', () => {
    expect(changedParams(cavity, resolveParams(cavity).values)).toEqual({})
    expect(changedParams(cavity, resolveParams(cavity, { nu: 0.001 }).values)).toEqual({ nu: 0.001 })
  })

  it('applies hand-edited files on top of the generated case', () => {
    const edited = renderCase(cavity, resolveParams(cavity)).files.get('system/controlDict')!.replace('endTime         0.5;', 'endTime         0.2;')
    const rendered = renderCase(cavity, resolveParams(cavity), { 'system/controlDict': edited })
    expect(rendered.files.get('system/controlDict')).toContain('endTime         0.2;')
    expect(rendered.hash).not.toBe(renderCase(cavity, resolveParams(cavity)).hash)
  })

  it('refuses executable or out-of-case content in hand-edited files', () => {
    expect(() => validateOverride(cavity, 'system/controlDict', 'x #codeStream { code #{ system("id"); #}; };')).toThrow(/disabled/)
    expect(() => validateOverride(cavity, 'system/controlDict', '#include "/etc/passwd"')).toThrow()
    expect(() => validateOverride(cavity, 'system/controlDict', '#includeEtc "caseDicts/x"')).toThrow()
    expect(() => validateOverride(cavity, 'system/controlDict', 'libs ("libevil.so");')).toThrow(/library/)
    expect(() => validateOverride(cavity, 'system/newFile', 'a 1;')).toThrow(/Not an editable/)
    expect(() => validateOverride(cavity, '../../etc/passwd', 'a 1;')).toThrow(/Not an editable/)
    expect(() => validateOverride(cavity, 'system/controlDict', 'x'.repeat(300 * 1024))).toThrow(/too large/)
    expect(validateOverride(cavity, 'system/controlDict', 'endTime 1;\r\n')).toBe('endTime 1;\n')
  })
})
