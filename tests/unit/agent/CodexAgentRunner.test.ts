import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const mocks = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('../../../core/agent/codex-runner.js', () => ({ runCodex: mocks.run }))
vi.mock('../../../core/setup/appConfig.js', () => ({ getActiveModel: () => 'gpt-6.1-sol', readConfig: () => ({}) }))
import { runCodexAgent } from '../../../core/agent/CodexAgentRunner.js'
let root: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ofs-codex-agent-test-'))
  for (const directory of ['0', 'constant', 'system']) fs.mkdirSync(path.join(root, directory))
  fs.writeFileSync(path.join(root, 'system', 'controlDict'), 'deltaT 0.1;\nendTime 10;')
  mocks.run.mockReset()
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))
const patch = (file: string, oldValue: string, newValue: string) => ({ file, description: 'Requested numerical change', oldValue, newValue })
describe('Codex proposal transactions', () => {
  it('applies a strictly typed patch and emits file evidence using the selected Sol model', async () => {
    mocks.run.mockResolvedValue(JSON.stringify({ summary: 'Halved the time step.', fix: [patch('system/controlDict', 'deltaT 0.1;', 'deltaT 0.05;')] }))
    const events: unknown[] = []
    expect(await runCodexAgent({ caseDir: root, prompt: 'Halve time step', onEvent: event => events.push(event) })).toMatchObject({ finishReason: 'success', finalText: 'Halved the time step.' })
    expect(fs.readFileSync(path.join(root, 'system', 'controlDict'), 'utf8')).toContain('deltaT 0.05;')
    expect(mocks.run.mock.calls[0]![3]).toBe('gpt-6.1-sol')
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'file', path: 'system/controlDict' })]))
  })
  it('changes nothing when a later patch is stale or out of context', async () => {
    mocks.run.mockResolvedValue(JSON.stringify({ summary: 'Two changes.', fix: [patch('system/controlDict', 'deltaT 0.1;', 'deltaT 0.05;'), patch('0/U', 'unknown', 'invented')] }))
    await expect(runCodexAgent({ caseDir: root, prompt: 'Refine', onEvent: () => {} })).rejects.toThrow(/context/)
    expect(fs.readFileSync(path.join(root, 'system', 'controlDict'), 'utf8')).toContain('deltaT 0.1;')
  })
  it('rejects writes during explanation-only turns', async () => {
    mocks.run.mockResolvedValue(JSON.stringify({ summary: 'Change.', fix: [patch('system/controlDict', 'deltaT 0.1;', 'deltaT 0.05;')] }))
    await expect(runCodexAgent({ caseDir: root, prompt: 'Explain', readOnly: true, onEvent: () => {} })).rejects.toThrow(/explanation-only/)
    expect(fs.readFileSync(path.join(root, 'system', 'controlDict'), 'utf8')).toContain('deltaT 0.1;')
  })
  it('does not apply a provider response received after cancellation', async () => {
    const controller = new AbortController()
    mocks.run.mockImplementation(async () => { controller.abort(); return JSON.stringify({ summary: 'Change.', fix: [patch('system/controlDict', 'deltaT 0.1;', 'deltaT 0.05;')] }) })
    expect(await runCodexAgent({ caseDir: root, prompt: 'Change', signal: controller.signal, onEvent: () => {} })).toMatchObject({ finishReason: 'aborted' })
    expect(fs.readFileSync(path.join(root, 'system', 'controlDict'), 'utf8')).toContain('deltaT 0.1;')
  })
})
