import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getActiveModel, getActiveProvider, getConfigPath, getProviderKey, readConfig, removeProviderKeys, setCredentialStore, writeConfig } from '../../core/setup/appConfig.js'

let directory: string
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ofs-config-test-'))
  vi.stubEnv('OFS_CONFIG_DIR', directory)
})
afterEach(() => {
  setCredentialStore(undefined)
  vi.unstubAllEnvs()
  fs.rmSync(directory, { recursive: true, force: true })
})

describe('configuration durability and credentials', () => {
  it('defaults to Codex while preserving an explicitly selected Claude provider, model and keys', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    expect(getActiveProvider({})).toBe('codex-cli')
    expect(getActiveModel({})).toBe('gpt-6.1-sol')
    await writeConfig({ llmProvider: 'claude-cli', llmModel: 'sonnet', apiKeys: { openai: 'preserved-key' } })
    expect(readConfig()).toMatchObject({ llmProvider: 'claude-cli', llmModel: 'sonnet', apiKeys: { openai: 'preserved-key' } })
    expect(getActiveProvider(readConfig())).toBe('claude-cli')
    expect(getActiveModel(readConfig())).toBe('sonnet')
  })
  it('persists switching between both CLI providers across config reloads', async () => {
    for (const selection of [
      { llmProvider: 'claude-cli' as const, llmModel: 'opus' },
      { llmProvider: 'codex-cli' as const, llmModel: 'gpt-6.1-sol' },
      { llmProvider: 'claude-cli' as const, llmModel: 'haiku' },
    ]) {
      await writeConfig(selection)
      expect(getActiveProvider(readConfig())).toBe(selection.llmProvider)
      expect(getActiveModel(readConfig())).toBe(selection.llmModel)
    }
  })
  it('replaces complete config atomically without leaving temporary files', async () => {
    await writeConfig({ llmProvider: 'openai', llmModel: 'custom' })
    await writeConfig({ llmProvider: 'google' })
    expect(readConfig()).toEqual({ llmProvider: 'google' })
    expect(fs.readdirSync(directory)).toEqual(['config.json'])
  })
  it('masks explicitly removed keys even when an inherited environment supplies them', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'environment-secret')
    const next = removeProviderKeys({ apiKeys: { openai: 'stored-secret' } }, ['openai'])
    await writeConfig(next)
    process.env['OPENAI_API_KEY'] = 'environment-secret'
    expect(getProviderKey('openai', readConfig())).toBeUndefined()
  })
  it('stores no plaintext keys in config when an OS credential adapter is available', async () => {
    const save = vi.fn(async () => {})
    setCredentialStore({ keys: {}, save })
    await writeConfig({ apiKeys: { anthropic: 'private-secret' }, anthropicApiKey: 'private-secret', llmProvider: 'anthropic' })
    expect(save).toHaveBeenCalledWith({ anthropic: 'private-secret' })
    expect(fs.readFileSync(getConfigPath(), 'utf8')).not.toContain('private-secret')
    expect(getProviderKey('anthropic')).toBe('private-secret')
  })
  it('preserves config when the credential adapter rejects a save', async () => {
    await writeConfig({ llmProvider: 'openai' })
    setCredentialStore({ keys: {}, save: async () => { throw new Error('keychain locked') } })
    await expect(writeConfig({ llmProvider: 'google', apiKeys: { google: 'private-secret' } })).rejects.toThrow('keychain locked')
    expect(readConfig().llmProvider).toBe('openai')
  })
})
