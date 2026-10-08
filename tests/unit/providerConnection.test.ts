import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testProviderConnection } from '../../core/setup/providerConnection.js'
import { generateOnce } from '../../core/agent/llm.js'
vi.mock('../../core/agent/llm.js', () => ({ generateOnce: vi.fn(), resolveSdkModel: vi.fn() }))
vi.mock('../../core/agent/codex-runner.js', () => ({ resolveCodexBin: () => null }))
vi.mock('../../core/agent/claude-runner.js', () => ({ resolveClaudeBin: () => null }))
beforeEach(() => { vi.clearAllMocks() })
describe('explicit CLI connection test', () => {
  it('tests selected Codex model with a synthetic prompt rather than trusting login status', async () => {
    vi.mocked(generateOnce).mockResolvedValue({ text: 'OK', provider: 'codex-cli', model: 'gpt-6.1-sol' })
    const result = await testProviderConnection({ llmProvider: 'codex-cli' })
    expect(result.ok).toBe(true)
    expect(generateOnce).toHaveBeenCalledWith(expect.stringContaining('Do not use tools'), 'Reply with OK.', expect.objectContaining({ provider: 'codex-cli', model: 'gpt-6.1-sol', maxOutputTokens: 32 }))
  })
  it('rejects expired or invalid auth even if login metadata may report logged in', async () => {
    vi.mocked(generateOnce).mockRejectedValue(new Error('OAuth expired'))
    const result = await testProviderConnection({ llmProvider: 'codex-cli' })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('codex login')
    expect(result.message).not.toContain('OAuth expired')
  })
  it('tests the selected Claude CLI model without switching to Codex', async () => {
    vi.mocked(generateOnce).mockResolvedValue({ text: 'OK', provider: 'claude-cli', model: 'opus' })
    const result = await testProviderConnection({ llmProvider: 'claude-cli', llmModel: 'opus' })
    expect(result).toMatchObject({ ok: true, provider: 'claude-cli', model: 'opus' })
    expect(generateOnce).toHaveBeenCalledWith(expect.any(String), 'Reply with OK.', expect.objectContaining({ provider: 'claude-cli', model: 'opus' }))
  })
  it('reports Claude authentication failure without trying a different provider', async () => {
    vi.mocked(generateOnce).mockRejectedValue(new Error('OAuth expired'))
    const result = await testProviderConnection({ llmProvider: 'claude-cli' })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('claude auth login')
    expect(generateOnce).toHaveBeenCalledTimes(1)
  })
  it('does not accept an empty CLI response as verified model access', async () => {
    vi.mocked(generateOnce).mockResolvedValue({ text: '', provider: 'codex-cli', model: 'gpt-6.1-sol' })
    expect((await testProviderConnection({ llmProvider: 'codex-cli' })).ok).toBe(false)
  })
})
