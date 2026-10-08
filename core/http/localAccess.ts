import type { IncomingHttpHeaders } from 'node:http'

/** Reject browser cross-site access and DNS rebinding before routing requests. */
export function allowLocalRequest(headers: IncomingHttpHeaders, port: number, devOrigin?: string): boolean {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`])
  if (!headers.host || !hosts.has(headers.host)) return false
  const origins = new Set([...hosts].map(host => `http://${host}`))
  if (devOrigin) origins.add(new URL(devOrigin).origin)
  if (headers.origin !== undefined) return origins.has(headers.origin)
  // CLI clients have no Fetch Metadata. Browsers must not access local data
  // through no-CORS requests from unrelated sites either.
  return headers['sec-fetch-site'] !== 'cross-site'
}
