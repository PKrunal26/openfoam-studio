import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ codex: vi.fn(), claude: vi.fn(), stream: vi.fn(), provider: 'codex-cli' }))
vi.mock('../../../core/agent/codex-runner.js', () => ({ runCodex: mocks.codex }))
vi.mock('../../../core/agent/claude-runner.js', () => ({ runClaude: mocks.claude }))
vi.mock('ai', () => ({ streamText: mocks.stream }))
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: () => () => ({ provider: 'test' }) }))
vi.mock('../../../core/setup/appConfig.js', () => ({
  readConfig: () => ({}), getActiveProvider: () => mocks.provider,
  getActiveModel: () => mocks.provider === 'codex-cli' ? 'gpt-6.1-sol' : mocks.provider === 'claude-cli' ? 'sonnet' : 'selected-api-model', getProviderKey: () => 'test-key-never-sent',
}))
import { Reviewer } from '../../../core/agent/Reviewer.js'
const files = { 'system/controlDict': 'deltaT 1;\nendTime 10;' }
const answer = JSON.stringify({ filename: 'system/controlDict', correctedContent: 'deltaT 0.005;\nendTime 10;', diagnosis: 'Reduce the excessive numerical step.' })
beforeEach(() => {
  mocks.provider = 'codex-cli'
  mocks.codex.mockReset(); mocks.claude.mockReset(); mocks.stream.mockReset()
  mocks.codex.mockResolvedValue(answer)
})
describe('Reviewer selected-provider recovery', () => {
  it('uses the selected Sol Codex model without calling Claude CLI', async () => {
    expect(await new Reviewer().review('Courant Number mean: 1 max: 12', files, { timeoutMs: 5000 })).toMatchObject({ filename: 'system/controlDict', correctedContent: 'deltaT 0.005;\nendTime 10;' })
    expect(mocks.codex).toHaveBeenCalledTimes(1)
    expect(mocks.codex.mock.calls[0]![3]).toBe('gpt-6.1-sol')
    expect(mocks.codex.mock.calls[0]![1]).toContain('### system/controlDict')
    expect(mocks.codex.mock.calls[0]![4].signal).toBeInstanceOf(AbortSignal)
    expect(mocks.claude).not.toHaveBeenCalled()
    expect(mocks.stream).not.toHaveBeenCalled()
  })
  it('uses the selected Claude CLI model for diagnostic recovery', async () => {
    mocks.provider = 'claude-cli'
    mocks.claude.mockResolvedValue(JSON.stringify({ result: answer }))
    expect(await new Reviewer().review('Bad numerical step', files)).toMatchObject({ filename: 'system/controlDict' })
    expect(mocks.claude).toHaveBeenCalledTimes(1)
    expect(mocks.claude.mock.calls[0]![3]).toBe('sonnet')
    expect(mocks.codex).not.toHaveBeenCalled()
    expect(mocks.stream).not.toHaveBeenCalled()
  })
  it('keeps a failed Claude request on the selected provider', async () => {
    mocks.provider = 'claude-cli'
    mocks.claude.mockRejectedValue(new Error('Claude authentication expired'))
    await expect(new Reviewer().review('Bad numerical step', files)).rejects.toThrow(/authentication expired/)
    expect(mocks.codex).not.toHaveBeenCalled()
    expect(mocks.stream).not.toHaveBeenCalled()
  })
  it('honors a selected direct API provider instead of using either CLI', async () => {
    mocks.provider = 'anthropic'
    mocks.stream.mockReturnValue({ text: Promise.resolve(answer) })
    expect(await new Reviewer().review('Bad numerical step', files)).toMatchObject({ filename: 'system/controlDict' })
    expect(mocks.stream).toHaveBeenCalledTimes(1)
    expect(mocks.codex).not.toHaveBeenCalled()
    expect(mocks.claude).not.toHaveBeenCalled()
  })
  it('rejects unknown filenames and unexpected diagnosis schema fields', async () => {
    mocks.codex.mockResolvedValue(JSON.stringify({ filename: '0/U', correctedContent: 'invented', diagnosis: 'Unknown target' }))
    await expect(new Reviewer().review('error', files)).rejects.toThrow(/unknown or unsafe/)
    mocks.codex.mockResolvedValue(JSON.stringify({ filename: 'system/controlDict', correctedContent: 'deltaT 0.005;', diagnosis: 'Change', command: 'shell' }))
    await expect(new Reviewer().review('error', files)).rejects.toThrow(/schema/)
  })
  it('supports a strict cannotIdentify response and LF-normalizes accepted files', async () => {
    mocks.codex.mockResolvedValue('{"cannotIdentify":true,"diagnosis":"Fluid input is required."}')
    expect(await new Reviewer().review('missing physics', files)).toEqual({ cannotIdentify: true, diagnosis: 'Fluid input is required.' })
    mocks.codex.mockResolvedValue(JSON.stringify({ filename: 'system/controlDict', correctedContent: 'deltaT 0.005;\r\nendTime 10;\r', diagnosis: 'Correction' }))
    expect(await new Reviewer().review('step error', files)).toMatchObject({ correctedContent: 'deltaT 0.005;\nendTime 10;\n' })
  })
  it('propagates cancellation without starting or accepting a provider response', async () => {
    const before = new AbortController(); before.abort()
    await expect(new Reviewer().review('error', files, { signal: before.signal })).rejects.toThrow()
    expect(mocks.codex).not.toHaveBeenCalled()
    const after = new AbortController()
    mocks.codex.mockImplementation(async () => { after.abort(); return answer })
    await expect(new Reviewer().review('error', files, { signal: after.signal })).rejects.toThrow()
  })
})
