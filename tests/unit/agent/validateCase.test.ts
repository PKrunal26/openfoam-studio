import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type Docker from 'dockerode'
const mocks = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('../../../core/docker/CommandRunner.js', async importOriginal => ({ ...await importOriginal<typeof import('../../../core/docker/CommandRunner.js')>(), runDockerCommand: mocks.run }))
import { validateCaseInIsolation } from '../../../core/run/validateCase.js'
let root: string
const control = 'solver incompressibleFluid;\nstartFrom latestTime;\nstartTime 0;\ndeltaT 0.1;\nendTime 10;\nwriteInterval 1000;\nwriteFormat binary;\n'
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ofs-isolation-test-'))
  for (const directory of ['0', 'constant', 'system']) fs.mkdirSync(path.join(root, directory))
  for (const file of ['0/U', '0/p', 'constant/physicalProperties', 'constant/momentumTransport', 'system/blockMeshDict', 'system/fvSchemes', 'system/fvSolution']) fs.writeFileSync(path.join(root, file), '')
  fs.writeFileSync(path.join(root, 'system', 'controlDict'), control)
  mocks.run.mockReset()
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))
describe('isolated validation', () => {
  it('writes numerical evidence in a private case and preserves the entire visible case', async () => {
    fs.mkdirSync(path.join(root, '1')); fs.writeFileSync(path.join(root, '1', 'p'), 'pre-existing output')
    let isolated = ''
    mocks.run.mockImplementation(async (_docker, options) => {
      options.onLine('sigFpe : Floating point exception trapping - not supported on this platform')
      isolated = options.caseDir
      expect(isolated).not.toBe(root)
      if (options.command === 'checkMesh') options.onLine('Mesh OK.')
      if (options.command === 'foamRun') {
        const copiedControl = fs.readFileSync(path.join(isolated, 'system', 'controlDict'), 'utf8')
        expect(copiedControl).toContain('writeFormat ascii;')
        expect(copiedControl).toContain('writeControl timeStep;')
        expect(copiedControl).toContain('writeInterval 1;')
        fs.mkdirSync(path.join(isolated, '0.5'))
        fs.writeFileSync(path.join(isolated, '0.5', 'U'), 'FoamFile { class volVectorField; format ascii; } internalField uniform (1 0 0);')
        fs.writeFileSync(path.join(isolated, '0.5', 'p'), 'FoamFile { class volScalarField; format ascii; } internalField uniform 0;')
        options.onLine('Time = 0.5'); options.onLine('Solving for Ux')
      }
      return 0
    })
    expect(await validateCaseInIsolation({} as Docker, root)).toMatchObject({ ok: true, meshChecked: true, solverAdvanced: true, fields: { ok: true } })
    expect(fs.readFileSync(path.join(root, 'system', 'controlDict'), 'utf8')).toBe(control)
    expect(fs.readFileSync(path.join(root, '1', 'p'), 'utf8')).toBe('pre-existing output')
    expect(fs.existsSync(path.join(root, '0.5'))).toBe(false)
    expect(fs.existsSync(isolated)).toBe(false)
  })
  it('stops at a failed mesh check even when checkMesh exits zero', async () => {
    mocks.run.mockImplementation(async (_docker, options) => { if (options.command === 'checkMesh') options.onLine('Failed 1 mesh checks.'); return 0 })
    expect(await validateCaseInIsolation({} as Docker, root)).toMatchObject({ ok: false, failedCommand: 'checkMesh', meshChecked: false })
    expect(mocks.run.mock.calls.map(call => call[1].command)).toEqual(['blockMesh', 'checkMesh'])
  })
  it('rejects an exit-zero solver with no written fields', async () => {
    mocks.run.mockImplementation(async (_docker, options) => {
      if (options.command === 'checkMesh') options.onLine('Mesh OK.')
      if (options.command === 'foamRun') { options.onLine('Time = 0.5'); options.onLine('Solving for Ux') }
      return 0
    })
    expect(await validateCaseInIsolation({} as Docker, root)).toMatchObject({ ok: false, failedCommand: 'foamRun', fields: { ok: false } })
  })
  it('rejects an actual floating point crash after an informational trapping header', async () => {
    mocks.run.mockImplementation(async (_docker, options) => {
      options.onLine('sigFpe : Floating point exception trapping - not supported on this platform')
      if (options.command === 'checkMesh') options.onLine('Mesh OK.')
      if (options.command === 'foamRun') {
        options.onLine('Time = 0.5s'); options.onLine('Solving for Ux')
        options.onLine('Floating point exception (core dumped)')
      }
      return 0
    })
    expect(await validateCaseInIsolation({} as Docker, root)).toMatchObject({ ok: false, failedCommand: 'foamRun' })
  })
  it('cancels before Docker is called', async () => {
    const controller = new AbortController(); controller.abort()
    await expect(validateCaseInIsolation({} as Docker, root, { signal: controller.signal })).rejects.toThrow()
    expect(mocks.run).not.toHaveBeenCalled()
  })
})
