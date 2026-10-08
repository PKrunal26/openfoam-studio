import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { validateWrittenFields } from '../../../core/postprocess/fieldValidation.js'
let root: string
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'ofs-fields-')); fs.mkdirSync(path.join(root, '0')); fs.mkdirSync(path.join(root, '1')) })
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))
const write = (name: string, body: string, vector = false) => fs.writeFileSync(path.join(root, '1', name), `FoamFile { format ascii; class vol${vector ? 'Vector' : 'Scalar'}Field; }\ninternalField ${body};`)
describe('written numerical evidence', () => {
  it('checks finite real outputs and reports the scope without claiming convergence', () => {
    write('U', 'nonuniform List<vector> 2 ((1 0 0) (0 1 0))', true); write('p', 'uniform 0')
    expect(validateWrittenFields(root)).toMatchObject({ ok: true, time: 1, scope: 'finite-written-internal-fields', checkedFields: ['U', 'p'] })
  })
  it.each(['uniform nan', 'uniform 1e999', 'nonuniform List<scalar> 2 (1)'])('rejects non-finite or malformed output %s', value => {
    write('p', value)
    expect(validateWrittenFields(root, { requiredFields: ['p'] }).ok).toBe(false)
  })
  it('rejects phase fractions outside their physical range', () => {
    write('alpha.oil', 'uniform 1.3')
    expect(validateWrittenFields(root, { requiredFields: ['alpha.oil'] }).issues).toContain('Phase fraction alpha.oil is outside [0,1]')
  })
  it('requires written progress rather than only an initial field', () => {
    fs.rmSync(path.join(root, '1'), { recursive: true })
    expect(validateWrittenFields(root).ok).toBe(false)
  })
  it('detects non-finite values beyond the former 256 KiB scan window', () => {
    write('p', `nonuniform List<scalar> 150001 (${Array(150000).fill('0').join(' ')} nan)`)
    expect(validateWrittenFields(root, { requiredFields: ['p'] }).issues).toContain('Non-finite value in p')
  })
  it('requires actual temperature and turbulence output when those inputs exist', () => {
    write('U', 'uniform (0 0 0)', true); write('p', 'uniform 0')
    fs.writeFileSync(path.join(root, '0', 'T'), 'initial temperature')
    fs.writeFileSync(path.join(root, '0', 'k'), 'initial turbulence')
    expect(validateWrittenFields(root).issues).toEqual(expect.arrayContaining(['Missing or unreadable field T at time 1', 'Missing or unreadable field k at time 1']))
  })
  it('returns evidence issues for missing case and initial-field directories', () => {
    expect(validateWrittenFields(path.join(root, 'absent')).ok).toBe(false)
    fs.rmSync(path.join(root, '0'), { recursive: true })
    expect(validateWrittenFields(root).issues).toContain('Initial field directory is missing or unreadable; required fields cannot be established')
  })
})
