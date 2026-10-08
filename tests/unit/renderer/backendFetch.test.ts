import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../../renderer/lib/backendUrl', () => ({ backendUrl: (value: string) => `http://localhost:3456${value}` }))
const fetchMock = vi.fn()
beforeEach(() => { vi.resetModules(); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => { vi.unstubAllGlobals() })
describe('local session recovery', () => {
  it('refreshes an invalidated session once for a read after backend restart', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ token: 'old' })).mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(Response.json({ token: 'fresh' })).mockResolvedValueOnce(Response.json({ name: 'restored' }))
    const { backendFetch } = await import('../../../renderer/lib/backendFetch')
    expect((await backendFetch('http://localhost:3456/api/projects')).ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(new Headers(fetchMock.mock.calls[3]![1].headers).get('X-OFS-Token')).toBe('fresh')
  })
  it('never automatically replays a mutation and refreshes for the next explicit attempt', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ token: 'old' })).mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(Response.json({ token: 'fresh' })).mockResolvedValueOnce(Response.json({ ok: true }))
    const { backendFetch } = await import('../../../renderer/lib/backendFetch')
    expect((await backendFetch('http://localhost:3456/api/projects/a/file', { method: 'PUT', body: '{}' })).status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await backendFetch('http://localhost:3456/api/projects/a/file', { method: 'PUT', body: '{}' })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
