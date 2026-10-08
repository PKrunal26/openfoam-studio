/** Redact configured secrets and conventional API/bearer tokens from shareable text. */
export function createTextRedactor(secrets: Array<string | undefined>) {
  const known = [...new Set(secrets.filter((value): value is string => !!value))].sort((a, b) => b.length - a.length)
  return (text: string): string => {
    let result = text
    for (const secret of known) result = result.split(secret).join('[REDACTED]')
    return result.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [REDACTED]')
      .replace(/\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}/g, '[REDACTED]')
      .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token)\s*["']?\s*[:=]\s*["']?)[^\s"',;}]{8,}/gi, '$1[REDACTED]')
  }
}

/** Traverse values instead of serialized JSON, preserving escapes and binary archive contents. */
export function redactObject<T>(value: T, redact: (text: string) => string): T {
  if (typeof value === 'string') return redact(value) as T
  if (Array.isArray(value)) return value.map(item => redactObject(item, redact)) as T
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactObject(item, redact)])) as T
  return value
}
