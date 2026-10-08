import { describe, expect, it } from 'vitest'
import { allowLocalRequest } from '../../core/http/localAccess.js'

describe('local HTTP access', () => {
  const host = '127.0.0.1:3456'
  it('allows the app and local command-line clients', () => {
    expect(allowLocalRequest({ host }, 3456)).toBe(true)
    expect(allowLocalRequest({ host, origin: `http://${host}` }, 3456)).toBe(true)
  })
  it('rejects foreign and opaque browser origins', () => {
    for (const origin of ['https://attacker.example', 'null', 'http://localhost:9999']) {
      expect(allowLocalRequest({ host, origin }, 3456)).toBe(false)
    }
  })
  it('rejects DNS rebinding and cross-site no-CORS requests', () => {
    expect(allowLocalRequest({ host: 'attacker.example:3456' }, 3456)).toBe(false)
    expect(allowLocalRequest({ host, 'sec-fetch-site': 'cross-site' }, 3456)).toBe(false)
  })
  it('allows the Vite origin only when explicitly enabled', () => {
    const headers = { host, origin: 'http://localhost:5173' }
    expect(allowLocalRequest(headers, 3456)).toBe(false)
    expect(allowLocalRequest(headers, 3456, headers.origin)).toBe(true)
  })
})
