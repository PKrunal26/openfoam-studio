import type { IncomingMessage } from 'node:http'

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) { super(message) }
}

/** Drain rejected input without leaving late socket errors unhandled. */
function drainRequest(req: IncomingMessage) {
  const ignoreError = () => undefined
  const cleanup = () => { req.off('error', ignoreError); req.off('end', cleanup); req.off('close', cleanup) }
  req.on('error', ignoreError).once('end', cleanup).once('close', cleanup)
  req.resume()
}

export function readRequestBody(req: IncomingMessage, limit = 2 * 1024 * 1024): Promise<string> {
  if (req.aborted || req.destroyed) return Promise.reject(new HttpError(400, 'Request was interrupted'))
  const length = req.headers['content-length']
  if (typeof length === 'string' && Number(length) > limit) {
    drainRequest(req)
    return Promise.reject(new HttpError(413, 'Request body is too large'))
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let bytes = 0
    const timer = setTimeout(() => { cleanup(); drainRequest(req); reject(new HttpError(408, 'Request body timed out')) }, 30_000)
    const cleanup = () => { clearTimeout(timer); req.off('data', onData); req.off('end', onEnd); req.off('error', onError); req.off('aborted', onAborted) }
    const onData = (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > limit) { cleanup(); drainRequest(req); reject(new HttpError(413, 'Request body is too large')); return }
      chunks.push(chunk)
    }
    const onEnd = () => { cleanup(); resolve(Buffer.concat(chunks).toString('utf8')) }
    const onError = () => { cleanup(); reject(new HttpError(400, 'Request transport failed')) }
    const onAborted = () => { cleanup(); drainRequest(req); reject(new HttpError(400, 'Request was interrupted')) }
    req.on('data', onData).on('end', onEnd).on('error', onError).on('aborted', onAborted)
  })
}

export function parseObject(body: string): Record<string, unknown> {
  let value: unknown
  try { value = JSON.parse(body || '{}') } catch { throw new HttpError(400, 'Body must be valid JSON') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Body must be a JSON object')
  return value as Record<string, unknown>
}

export function stringField(object: Record<string, unknown>, key: string, max = 50_000): string | undefined {
  const value = object[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length > max) throw new HttpError(400, `${key} must be a string of at most ${max} characters`)
  return value
}
