import { backendUrl } from './backendUrl'
let sessionToken: Promise<string> | null = null
async function token(): Promise<string> {
  if (!sessionToken) sessionToken = fetch(backendUrl('/api/session'), { credentials: 'include', signal: AbortSignal.timeout(10_000) })
    .then(async (res) => { if (!res.ok) throw new Error('Cannot establish a local session. Retry after reconnecting.'); return (await res.json() as { token: string }).token })
    .catch((err) => { sessionToken = null; throw err })
  return sessionToken
}
export async function backendFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const requestURL = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const pathname = new URL(requestURL, typeof location === 'undefined' ? 'http://localhost' : location.href).pathname
  if (['/health', '/api/session', '/api/identity'].includes(pathname) || method === 'OPTIONS') return fetch(input, init)
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  headers.set('X-OFS-Token', await token())
  if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const response = await fetch(input, { ...init, headers })
  if (response.status !== 401) return response
  sessionToken = null
  // A backend restart invalidates the local session. Only reads are replayed;
  // mutations require an explicit retry so work cannot execute twice.
  if (method !== 'GET' && method !== 'HEAD') return response
  headers.set('X-OFS-Token', await token())
  if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  return fetch(input, { ...init, headers })
}
