/**
 * Unit tests for applyFixes — the pure file-mutation logic behind the
 * apply-fix endpoint. No Docker, no server; operates on a temp case dir.
 *
 * Regression focus: a diagnosis that CREATES a missing file (empty oldValue,
 * full content in newValue) must author the file instead of 404-ing. This is
 * the incompressibleVoF / dam-break case where constant/phaseProperties is
 * entirely absent.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { applyFixes } from '../../../core/agent/applyFix.js'

let caseDir: string

beforeEach(() => {
  caseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ofs-applyfix-'))
})

afterEach(() => {
  fs.rmSync(caseDir, { recursive: true, force: true })
})

describe('applyFixes — create file (missing dictionary)', () => {
  it('creates an absent file when oldValue is empty', () => {
    const content = 'FoamFile\n{\n    version 2.0;\n}\n'
    const result = applyFixes(caseDir, [
      {
        file: 'constant/phaseProperties',
        description: 'Create missing phaseProperties',
        oldValue: '',
        newValue: content,
      },
    ])

    expect(result.ok).toBe(true)
    const written = path.join(caseDir, 'constant/phaseProperties')
    expect(fs.existsSync(written)).toBe(true)
    expect(fs.readFileSync(written, 'utf8')).toBe(content)
  })

  it('creates parent directories that do not yet exist', () => {
    const result = applyFixes(caseDir, [
      {
        file: 'constant/phaseProperties',
        description: 'Create missing phaseProperties',
        oldValue: '',
        newValue: 'phases (water air);\n',
      },
    ])
    expect(result.ok).toBe(true)
    expect(fs.existsSync(path.join(caseDir, 'constant'))).toBe(true)
  })

  it('normalises CRLF to LF on created files', () => {
    applyFixes(caseDir, [
      { file: 'constant/x', description: 'd', oldValue: '', newValue: 'a\r\nb\r\n' },
    ])
    expect(fs.readFileSync(path.join(caseDir, 'constant/x'), 'utf8')).toBe('a\nb\n')
  })
})

describe('applyFixes — edit existing file (unchanged behavior)', () => {
  it('replaces an exact substring in an existing file', () => {
    const file = path.join(caseDir, 'system')
    fs.mkdirSync(file, { recursive: true })
    fs.writeFileSync(path.join(file, 'fvSolution'), 'type            fixedGradient;\n')

    const result = applyFixes(caseDir, [
      {
        file: 'system/fvSolution',
        description: 'fix bc',
        oldValue: 'type            fixedGradient',
        newValue: 'type            noSlip',
      },
    ])
    expect(result.ok).toBe(true)
    expect(fs.readFileSync(path.join(file, 'fvSolution'), 'utf8')).toBe('type            noSlip;\n')
  })

  it('404s when editing (non-empty oldValue) a file that does not exist', () => {
    const result = applyFixes(caseDir, [
      { file: '0/U', description: 'd', oldValue: 'foo', newValue: 'bar' },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(404)
  })
})

describe('applyFixes — path traversal guard', () => {
  it('rejects paths escaping the case dir', () => {
    const result = applyFixes(caseDir, [
      { file: '../escape', description: 'd', oldValue: '', newValue: 'x' },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
  })
})
