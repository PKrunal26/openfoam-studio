import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertSafeDictionary, assertCaseExecutionPolicy, safeCasePath } from '../../../core/run/casePolicy.js'
import { applyFixes, DiagnosisSchema } from '../../../core/agent/applyFix.js'
import { makeTools, toolResultSucceeded } from '../../../core/agent/tools.js'
import { assertAllowedCommandArgs, meshCheckPassed } from '../../../core/docker/CommandRunner.js'
import { inspectCaseReadiness } from '../../../core/run/validateCase.js'

let root: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ofs-safety-'))
  for (const directory of ['0', 'constant', 'system']) fs.mkdirSync(path.join(root, directory))
})
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }) })
const fix = (file: string, oldValue: string, newValue: string) => ({ file, oldValue, newValue, description: 'Reviewed correction' })

describe('case execution boundary', () => {
  it.each(['#codeStream { code #{system("x");#}; }', '#calc "1+1"', '#includeEtc "secret"', '#include "/etc/passwd"', '#include "../secret"', '#includeFunc arbitrary', 'type codedFixedValue;', 'type systemCall;', 'libs ("/tmp/custom.so");'])('rejects executable/external dictionary %s', dictionary => {
    expect(() => assertSafeDictionary(dictionary)).toThrow()
  })
  it('accepts ordinary dictionaries and reviewed shipped function libraries', () => {
    expect(() => assertSafeDictionary('solver incompressibleFluid; libs ("libfieldFunctionObjects.so"); // #codeStream in a comment')).not.toThrow()
  })
  it('rejects symbolic-link input and mutation paths', () => {
    fs.symlinkSync(os.tmpdir(), path.join(root, 'system', 'escape'))
    expect(() => safeCasePath(root, 'system/escape/controlDict')).toThrow(/link/i)
    expect(() => assertCaseExecutionPolicy(root)).toThrow(/link/i)
  })
  it('supports bounded generated mesh data without creating an executable-dictionary bypass', () => {
    const mesh = path.join(root, 'constant', 'polyMesh')
    fs.mkdirSync(mesh)
    fs.writeFileSync(path.join(mesh, 'points'), 'FoamFile { format ascii; class vectorField; }\n' + ' '.repeat(9 * 1024 * 1024))
    expect(() => assertCaseExecutionPolicy(root)).not.toThrow()
    fs.writeFileSync(path.join(mesh, 'boundary'), '#codeStream { code #{ malicious #}; }')
    expect(() => assertCaseExecutionPolicy(root)).toThrow(/Executable/)
  })
  it('rejects executable loading flags and foreign case directories', () => {
    expect(() => assertAllowedCommandArgs('foamRun', ['-lib', '/tmp/custom.so'])).toThrow()
    expect(() => assertAllowedCommandArgs('foamRun', ['-case', '/host'])).toThrow()
    expect(() => assertAllowedCommandArgs('foamToVTK', ['-case', '/cavity', '-ascii', '-fields', '(U p p_rgh)'])).not.toThrow()
  })
  it('fails mesh validation on zero exit with failed checks', () => {
    expect(meshCheckPassed(0, 'Failed 1 mesh checks.')).toBe(false)
    expect(meshCheckPassed(0, 'Mesh OK.')).toBe(true)
    expect(meshCheckPassed(1, 'Mesh OK.')).toBe(false)
  })
})

describe('patch preflight and rollback', () => {
  it('changes nothing when a later file has no matching text', () => {
    fs.writeFileSync(path.join(root, '0', 'U'), 'before')
    fs.writeFileSync(path.join(root, '0', 'p'), 'pressure')
    expect(applyFixes(root, [fix('0/U', 'before', 'after'), fix('0/p', 'missing', 'new')]).ok).toBe(false)
    expect(fs.readFileSync(path.join(root, '0', 'U'), 'utf8')).toBe('before')
  })
  it('does not overwrite an existing file through the create convention', () => {
    fs.writeFileSync(path.join(root, '0', 'U'), 'before')
    expect(applyFixes(root, [fix('0/U', '', 'new')]).ok).toBe(false)
    expect(fs.readFileSync(path.join(root, '0', 'U'), 'utf8')).toBe('before')
  })
  it('rejects ambiguous replacement, stale expected content and sentinel no-ops', () => {
    fs.writeFileSync(path.join(root, 'system', 'controlDict'), 'deltaT 0.1;\nfoo foo')
    expect(applyFixes(root, [fix('system/controlDict', 'foo', 'bar')]).ok).toBe(false)
    expect(applyFixes(root, [{ ...fix('system/controlDict', 'deltaT 0.1;', 'deltaT 0.05;'), expectedContent: 'stale' }]).ok).toBe(false)
    fs.writeFileSync(path.join(root, 'system', 'fvSolution'), 'PIMPLE {}')
    expect(applyFixes(root, [fix('system/fvSolution', 'ADD_UFINAL', 'ADD_UFINAL')]).ok).toBe(false)
  })
  it('rolls back the first commit when the second rename fails', () => {
    fs.writeFileSync(path.join(root, '0', 'U'), 'before U')
    fs.writeFileSync(path.join(root, '0', 'p'), 'before p')
    const originalRename = fs.renameSync
    let calls = 0
    vi.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      if (++calls === 2) throw new Error('simulated disk failure')
      return originalRename(source, destination)
    })
    expect(applyFixes(root, [fix('0/U', 'before U', 'after U'), fix('0/p', 'before p', 'after p')]).ok).toBe(false)
    expect(fs.readFileSync(path.join(root, '0', 'U'), 'utf8')).toBe('before U')
    expect(fs.readFileSync(path.join(root, '0', 'p'), 'utf8')).toBe('before p')
  })
  it('rejects malformed or unbounded diagnosis objects', () => {
    expect(DiagnosisSchema.safeParse({ errorClass: 'bad', description: 'bad', fix: [{ file: '0/U', oldValue: 4, newValue: 'x' }] }).success).toBe(false)
  })
})

describe('read-only and domain tracing', () => {
  it('removes mutation and Docker tools from an explanation turn', () => {
    const tools = makeTools({ caseDir: root, readOnly: true, onEvent: () => {} })
    expect(Object.keys(tools)).not.toEqual(expect.arrayContaining(['write_case_file']))
    expect('write_case_file' in tools).toBe(false)
    expect('edit_case_file' in tools).toBe(false)
    expect('run_command' in tools).toBe(false)
    expect('read_case_file' in tools).toBe(true)
  })
  it('reports completed transports with domain failures honestly', () => {
    expect(toolResultSucceeded({ ok: false, exitCode: 0 })).toBe(false)
    expect(toolResultSucceeded({ exitCode: 2 })).toBe(false)
    expect(toolResultSucceeded({ error: 'failed' })).toBe(false)
    expect(toolResultSucceeded({ ok: true, exitCode: 0 })).toBe(true)
  })
  it('checks cancellation before an input write', async () => {
    const abort = new AbortController(); abort.abort()
    const events: unknown[] = []
    const tools = makeTools({ caseDir: root, signal: abort.signal, onEvent: event => events.push(event) })
    const execute = tools.write_case_file.execute as (input: unknown, context: unknown) => Promise<unknown>
    await execute({ path: '0/U', content: 'new' }, {})
    expect(fs.existsSync(path.join(root, '0', 'U'))).toBe(false)
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'tool-result', ok: false })]))
  })
})

describe('solver-aware prerequisites', () => {
  it('requires p_rgh and per-phase properties for VoF, not single-phase p/physicalProperties', () => {
    const files: Record<string, string> = {
      '0/U': '', '0/p_rgh': '', '0/alpha.oil': '', 'constant/g': '',
      'constant/phaseProperties': 'phases (oil gas);', 'constant/physicalProperties.oil': '', 'constant/physicalProperties.gas': '',
      'system/controlDict': 'solver incompressibleVoF;\nstartTime 0;\ndeltaT 0.01;\nendTime 1;',
      'system/blockMeshDict': '', 'system/fvSchemes': '', 'system/fvSolution': '',
    }
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(root, name), content)
    const readiness = inspectCaseReadiness(root)
    expect(readiness.ok).toBe(true)
    expect(readiness.missing).not.toContain('0/p')
    fs.rmSync(path.join(root, '0', 'p_rgh'))
    expect(inspectCaseReadiness(root).missing).toContain('0/p_rgh')
  })
})
