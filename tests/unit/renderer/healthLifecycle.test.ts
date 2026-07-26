/**
 * Renderer health-lifecycle tests.
 *
 * Two failure modes that used to leave the user in the dark:
 *   1. GET /health never answers → the fetch had no timeout, so it hung forever.
 *   2. The request failed → runHealthCheck swallowed it without notifying
 *      listeners, so `health` stayed null and App.tsx fell through to the
 *      workspace with no setup modal and no error.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getHealthMock = vi.fn()

vi.mock('../../../renderer/lib/api', () => ({
  getHealth: (...args: unknown[]) => getHealthMock(...args),
}))

import {
  runHealthCheck,
  subscribeHealth,
  getLatestHealth,
  stopHealthLifecycle,
  _resetHealthLifecycle,
} from '../../../renderer/lib/healthLifecycle'

beforeEach(() => {
  getHealthMock.mockReset()
  _resetHealthLifecycle()
})

afterEach(() => {
  stopHealthLifecycle()
})

describe('runHealthCheck — request failure', () => {
  it('notifies listeners with an ok:false result instead of staying silent', async () => {
    getHealthMock.mockRejectedValue(new Error('The health check timed out'))
    const seen: unknown[] = []
    subscribeHealth((r) => seen.push(r))

    const result = await runHealthCheck('startup')

    expect(result.ok).toBe(false)
    expect(seen).toHaveLength(1)
    expect(getLatestHealth()?.ok).toBe(false)
  })

  it('surfaces a failing check the setup modal can render', async () => {
    getHealthMock.mockRejectedValue(new Error('The health check timed out'))

    const result = await runHealthCheck('startup')
    const failing = result.checks.filter((c) => !c.pass)

    expect(failing.length).toBeGreaterThan(0)
    // SetupModal keys its screens off these names; 'docker' is first in its
    // priority order, so the synthetic result must use a real name.
    expect(['docker', 'image', 'claude_cli', 'claude_auth']).toContain(failing[0]!.name)
    expect(failing[0]!.fix).toMatch(/timed out/i)
  })

  it('does not reject — callers treat a failed probe as unhealthy, not as an error', async () => {
    getHealthMock.mockRejectedValue(new Error('boom'))
    await expect(runHealthCheck('periodic')).resolves.toBeDefined()
  })
})

describe('runHealthCheck — success', () => {
  it('passes the server result through untouched', async () => {
    const ok = { ok: true, checks: [{ name: 'docker', label: 'Docker daemon', pass: true, fix: '', canAutoFix: true }] }
    getHealthMock.mockResolvedValue(ok)

    const result = await runHealthCheck('startup')
    expect(result).toEqual(ok)
    expect(getLatestHealth()).toEqual(ok)
  })

  it('shares one in-flight probe between concurrent callers', async () => {
    getHealthMock.mockResolvedValue({ ok: true, checks: [] })
    const [a, b] = await Promise.all([runHealthCheck('manual'), runHealthCheck('manual')])
    expect(getHealthMock).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })
})
