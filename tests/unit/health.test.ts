/**
 * Health-check timeout tests (no Docker daemon needed).
 *
 * A Docker daemon that is installed but starting, wedged, or listening on a
 * socket the app cannot reach leaves docker.ping() pending forever. Without a
 * timeout, GET /health never responds and the setup modal never appears — the
 * user gets the workspace with no warning. These tests pin the timeout.
 */

import { describe, it, expect, vi } from 'vitest'
import type Docker from 'dockerode'
import { repairHealthChecks, runHealthChecks, waitForDockerReady } from '../../core/health.js'

/** A docker double whose calls never settle. */
function hangingDocker(): Docker {
  const never = () => new Promise<never>(() => {})
  return { ping: never, listImages: never } as unknown as Docker
}

/** A docker double that pings fine but hangs listing images. */
function pingOkImagesHang(): Docker {
  return {
    ping: async () => 'OK',
    listImages: () => new Promise<never>(() => {}),
  } as unknown as Docker
}

const stubProbes = { config: { llmProvider: 'anthropic' as const }, hasClaudeCli: () => true, hasAuth: () => true }

describe('runHealthChecks — unresponsive Docker daemon', () => {
  it('resolves instead of hanging when ping never settles', async () => {
    const start = Date.now()
    const result = await runHealthChecks(hangingDocker(), {
      ...stubProbes,
      dockerTimeoutMs: 300,
    })
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(3000)
    expect(result.ok).toBe(false)
    expect(result.checks.find(c => c.name === 'docker')?.pass).toBe(false)
  }, 10_000)

  it('reports the image check as failed rather than hanging on listImages', async () => {
    const result = await runHealthChecks(pingOkImagesHang(), {
      ...stubProbes,
      dockerTimeoutMs: 300,
    })

    expect(result.checks.find(c => c.name === 'docker')?.pass).toBe(true)
    expect(result.checks.find(c => c.name === 'image')?.pass).toBe(false)
    expect(result.ok).toBe(false)
  }, 10_000)

  it('still returns all four checks when Docker is unreachable', async () => {
    const result = await runHealthChecks(hangingDocker(), {
      ...stubProbes,
      dockerTimeoutMs: 300,
    })
    expect(result.checks.map(c => c.name)).toEqual([
      'docker',
      'image',
      'claude_cli',
      'claude_auth',
    ])
  }, 10_000)

  it('tells the user Docker is unreachable in the docker check fix hint', async () => {
    const result = await runHealthChecks(hangingDocker(), {
      ...stubProbes,
      dockerTimeoutMs: 300,
    })
    const dockerCheck = result.checks.find(c => c.name === 'docker')!
    expect(dockerCheck.fix).toMatch(/Docker/i)
    expect(dockerCheck.canAutoFix).toBe(true)
  }, 10_000)
})

describe('runHealthChecks — reachable Docker', () => {
  it('passes docker + image when both respond', async () => {
    const docker = {
      ping: async () => 'OK',
      listImages: async () => [{ Id: 'sha256:abc' }],
    } as unknown as Docker

    const result = await runHealthChecks(docker, stubProbes)
    expect(result.checks.find(c => c.name === 'docker')?.pass).toBe(true)
    expect(result.checks.find(c => c.name === 'image')?.pass).toBe(true)
    expect(result.ok).toBe(true)
  }, 10_000)

  it('fails the image check when the image is absent', async () => {
    const docker = {
      ping: async () => 'OK',
      listImages: async () => [],
    } as unknown as Docker

    const result = await runHealthChecks(docker, stubProbes)
    expect(result.checks.find(c => c.name === 'image')?.pass).toBe(false)
  }, 10_000)
})

describe('selected provider and repair boundaries', () => {
  const docker = { ping: async () => 'OK', listImages: async () => [{}] } as unknown as Docker
  it('Codex selection checks only the Codex CLI and login status', async () => {
    const result = await runHealthChecks(docker, { config: { llmProvider: 'codex-cli' }, hasCodexCli: () => false, hasClaudeCli: () => true, hasAuth: () => false })
    expect(result.checks.map(check => check.name)).toEqual(['docker', 'image', 'codex_cli', 'codex_auth'])
    expect(result.ok).toBe(false)
    expect(result.checks.find(check => check.name === 'codex_cli')?.commands).toEqual(['npm install -g @openai/codex', 'codex login'])
  })
  it('an API provider does not need the Claude CLI', async () => {
    const result = await runHealthChecks(docker, { config: { llmProvider: 'openai', apiKeys: { openai: 'test-key' } }, hasClaudeCli: () => false })
    expect(result.ok).toBe(true)
    expect(result.checks.find(check => check.name === 'claude_auth')?.commands).toBeUndefined()
  })
  it('Claude selection checks Claude availability and supplies its own login command', async () => {
    const codexProbe = vi.fn(() => true)
    const result = await runHealthChecks(docker, { config: { llmProvider: 'claude-cli' }, hasCodexCli: codexProbe, hasClaudeCli: () => false, hasAuth: () => false })
    expect(result.checks.map(check => check.name)).toEqual(['docker', 'image', 'claude_cli', 'claude_auth'])
    expect(result.checks.find(check => check.name === 'claude_cli')).toMatchObject({ label: 'Claude Code CLI', pass: false })
    expect(result.checks.find(check => check.name === 'claude_auth')?.fix).toBe('claude auth login')
    expect(result.checks.find(check => check.name === 'claude_auth')?.commands).toEqual(['claude auth login'])
    expect(codexProbe).not.toHaveBeenCalled()
  })
  it('an unrelated provider key never satisfies selected provider auth', async () => {
    const result = await runHealthChecks(docker, { config: { llmProvider: 'google', apiKeys: { anthropic: 'test-key' }, removedApiKeys: ['google'] }, hasClaudeCli: () => true })
    expect(result.checks.find(check => check.name === 'claude_auth')?.pass).toBe(false)
  })
  it('copyable image instructions contain only the command', async () => {
    const result = await runHealthChecks(docker, stubProbes)
    expect(result.checks.find(check => check.name === 'image')?.fix).toBe('docker pull microfluidica/openfoam:13')
  })
  it('each repair readiness probe is bounded even if ping never settles', async () => {
    const start = Date.now()
    expect(await waitForDockerReady(hangingDocker(), 25)).toBe(false)
    expect(Date.now() - start).toBeLessThan(1000)
  })
  it('cancels a repair even if an injected command never settles', async () => {
    const controller = new AbortController()
    const before = await runHealthChecks({ ping: async () => { throw new Error('down') } } as unknown as Docker, stubProbes)
    const repair = repairHealthChecks(docker, { signal: controller.signal, platform: 'darwin', checkHealth: async () => before, runCommand: () => new Promise(() => {}) })
    controller.abort()
    await expect(repair).rejects.toThrow(/cancelled/)
  })
})
