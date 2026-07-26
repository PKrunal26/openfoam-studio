/**
 * Health-check timeout tests (no Docker daemon needed).
 *
 * A Docker daemon that is installed but starting, wedged, or listening on a
 * socket the app cannot reach leaves docker.ping() pending forever. Without a
 * timeout, GET /health never responds and the setup modal never appears — the
 * user gets the workspace with no warning. These tests pin the timeout.
 */

import { describe, it, expect } from 'vitest'
import type Docker from 'dockerode'
import { runHealthChecks } from '../../core/health.js'

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

const stubProbes = { hasClaudeCli: () => true, hasAuth: () => true }

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
