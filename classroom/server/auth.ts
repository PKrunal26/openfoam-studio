/**
 * Stateless signed session cookies plus a small in-memory attempt limiter.
 * A class has no email system to lean on, so accounts are a display name and a
 * PIN the student chooses; the class code gates who may create one.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const STUDENT_COOKIE = 'ofs_class'
export const INSTRUCTOR_COOKIE = 'ofs_instructor'
const SESSION_DAYS = 150

export function loadSecret(dataDir: string): Buffer {
  const fromEnv = process.env['OFS_SESSION_SECRET']
  if (fromEnv && fromEnv.length >= 32) return Buffer.from(fromEnv)
  const file = path.join(dataDir, 'secret.key')
  if (fs.existsSync(file)) return fs.readFileSync(file)
  const secret = randomBytes(48)
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(file, secret, { mode: 0o600 })
  return secret
}

export class Sessions {
  constructor(private readonly secret: Buffer, private readonly secure: boolean) {}

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url')
  }

  issue(subject: string, days = SESSION_DAYS): string {
    const payload = Buffer.from(JSON.stringify({ s: subject, e: Date.now() + days * 86_400_000 })).toString('base64url')
    return `${payload}.${this.sign(payload)}`
  }

  /** The subject of a valid, unexpired token; null otherwise. */
  verify(token: string | undefined): string | null {
    if (!token) return null
    const [payload, signature] = token.split('.')
    if (!payload || !signature) return null
    const expected = Buffer.from(this.sign(payload))
    const actual = Buffer.from(signature)
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { s?: unknown; e?: unknown }
      if (typeof data.s !== 'string' || typeof data.e !== 'number' || data.e < Date.now()) return null
      return data.s
    } catch { return null }
  }

  setCookie(res: ServerResponse, name: string, token: string, days = SESSION_DAYS): void {
    appendCookie(res, `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${days * 86_400}${this.secure ? '; Secure' : ''}`)
  }

  clearCookie(res: ServerResponse, name: string): void {
    appendCookie(res, `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${this.secure ? '; Secure' : ''}`)
  }
}

function appendCookie(res: ServerResponse, cookie: string): void {
  const existing = res.getHeader('Set-Cookie')
  const list = Array.isArray(existing) ? existing : typeof existing === 'string' ? [existing] : []
  res.setHeader('Set-Cookie', [...list, cookie])
}

export function readCookie(req: IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const index = part.indexOf('=')
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim()
  }
  return undefined
}

/** Sliding-window limiter for sign-in attempts, keyed by client and account. */
export class AttemptLimiter {
  private attempts = new Map<string, number[]>()
  constructor(private readonly max: number, private readonly windowMs: number) {}

  /** Records an attempt; false when the key is over its limit. */
  allow(key: string): boolean {
    const now = Date.now()
    const recent = (this.attempts.get(key) ?? []).filter(time => now - time < this.windowMs)
    if (recent.length >= this.max) { this.attempts.set(key, recent); return false }
    recent.push(now)
    this.attempts.set(key, recent)
    if (this.attempts.size > 5000) {
      for (const [k, times] of this.attempts) if (times.every(time => now - time >= this.windowMs)) this.attempts.delete(k)
    }
    return true
  }

  reset(key: string): void { this.attempts.delete(key) }
}

/** Constant-time comparison for shared codes. */
export function codesMatch(supplied: string, expected: string): boolean {
  const a = createHmac('sha256', 'ofs-code').update(supplied.trim()).digest()
  const b = createHmac('sha256', 'ofs-code').update(expected.trim()).digest()
  return timingSafeEqual(a, b)
}
