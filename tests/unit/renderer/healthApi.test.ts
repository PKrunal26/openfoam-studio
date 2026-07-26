/**
 * getHealth() timeout tests.
 *
 * GET /health used to be a bare fetch with no AbortSignal: an unresponsive
 * Docker daemon left the request pending for the life of the window.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { getHealth } from '../../../renderer/lib/api'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
  vi.restoreAllMocks()
})

describe('getHealth', () => {
  it('rejects once the timeout elapses instead of hanging', async () => {
    // A server that accepts the connection and then never answers.
    globalThis.fetch = vi.fn((_url: unknown, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        })
      })
    }) as unknown as typeof fetch

    const start = Date.now()
    await expect(getHealth({ timeoutMs: 200 })).rejects.toThrow()
    expect(Date.now() - start).toBeLessThan(3000)
  }, 10_000)

  it('passes an abort signal to fetch', async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify({ ok: true, checks: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    globalThis.fetch = spy as unknown as typeof fetch

    await getHealth({ timeoutMs: 5000 })

    const init = spy.mock.calls[0]![1] as RequestInit | undefined
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('returns the parsed body on success', async () => {
    const payload = { ok: false, checks: [{ name: 'docker', label: 'Docker daemon', pass: false, fix: 'Start Docker', canAutoFix: true }] }
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch

    await expect(getHealth()).resolves.toEqual(payload)
  })

  it('throws on a non-2xx status', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch
    await expect(getHealth()).rejects.toThrow(/500/)
  })
})
