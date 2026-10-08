import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const mocks = vi.hoisted(() => ({ generate: vi.fn() }))
vi.mock('../../../core/agent/llm.js', () => ({ generateWithLLM: mocks.generate }))
import { diagnoseCase } from '../../../core/agent/diagnoseCase.js'
let root: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ofs-diagnosis-test-'))
  for (const directory of ['0', 'constant', 'system']) fs.mkdirSync(path.join(root, directory))
  mocks.generate.mockReset()
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))
describe('context-aware strict diagnosis', () => {
  it('does not ask a model to invent missing fluid or initial-field data', async () => {
    for (const file of ['constant/phaseProperties', 'constant/physicalProperties.oil', 'constant/g', '0/alpha.oil']) {
      expect(await diagnoseCase(`cannot find file "/cavity/${file}"`, root)).toMatchObject({ fix: [] })
    }
    expect(mocks.generate).not.toHaveBeenCalled()
  })
  it('uses the actual SIMPLE block instead of assuming PIMPLE', async () => {
    const solution = 'solvers {}\nSIMPLE\n{\n nNonOrthogonalCorrectors 0;\n}'
    fs.writeFileSync(path.join(root, 'system', 'fvSolution'), solution)
    const result = await diagnoseCase('No reference cell found for field p', root)
    expect(result?.fix[0]).toMatchObject({ oldValue: 'SIMPLE\n{', expectedContent: solution })
    expect(result?.fix[0]?.newValue).toContain('pRefCell 0;')
  })
  it('supplies phase and pressure context and captures the exact original content', async () => {
    fs.writeFileSync(path.join(root, 'constant', 'phaseProperties'), 'phases (oil gas);')
    fs.writeFileSync(path.join(root, '0', 'p_rgh'), 'pressure dimensions;')
    fs.writeFileSync(path.join(root, 'system', 'fvSolution'), 'PIMPLE { wrong; }')
    mocks.generate.mockResolvedValue({ text: JSON.stringify({ errorClass: 'numeric-entry', description: 'Correct a numerical entry', fix: [{ file: 'system/fvSolution', description: 'Entry correction', oldValue: 'wrong;', newValue: 'correct;' }] }) })
    const result = await diagnoseCase('Unknown numerical entry', root)
    expect(mocks.generate.mock.calls[0]![1]).toContain('phases (oil gas);')
    expect(mocks.generate.mock.calls[0]![1]).toContain('=== 0/p_rgh ===')
    expect(result?.fix[0]?.expectedContent).toBe('PIMPLE { wrong; }')
  })
  it('rejects guessed physical-file creation even when the model response conforms to the schema', async () => {
    mocks.generate.mockResolvedValue({ text: JSON.stringify({ errorClass: 'physical', description: 'Guessed water', fix: [{ file: 'constant/physicalProperties', description: 'Create guessed physics', oldValue: '', newValue: 'nu 1e-6;' }] }) })
    expect(await diagnoseCase('Unclassified startup error', root)).toBeNull()
  })
  it('rejects unexpected schema fields and propagates cancellation after a response', async () => {
    mocks.generate.mockResolvedValue({ text: '{"errorClass":"bad","description":"bad","fix":[],"command":"rm"}' })
    expect(await diagnoseCase('unclassified', root)).toBeNull()
    const controller = new AbortController()
    mocks.generate.mockImplementation(async () => { controller.abort(); return { text: '{"errorClass":"x","description":"x","fix":[]}' } })
    await expect(diagnoseCase('unclassified', root, controller.signal)).rejects.toThrow()
  })
})
