import { backendUrl } from './backendUrl'

/**
 * SSE wrappers for the OpenFOAM Studio backend.
 *
 * The backend uses POST + SSE (not GET + EventSource), so we use fetch with a
 * streaming response and manually parse the `data: {...}\n\n` framing.
 */

export type GenerateEvent =
  | { type: 'status'; message: string }
  | { type: 'thinking'; message: string; elapsed?: number }
  | { type: 'file'; path: string; content?: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
  // Agent loop events — emitted only for AI-SDK-driven multi-turn generation.
  | { type: 'agent-step'; index: number; text?: string }
  | { type: 'tool-call'; id: string; tool: string; args: unknown }
  | { type: 'tool-progress'; id: string; line: string }
  | { type: 'tool-result'; id: string; tool: string; ok: boolean; preview?: string; durationMs: number }
  | { type: 'finish'; summary: string }

export type RunEvent =
  | { type: 'run-started'; runId: string }
  | { type: 'log'; line: string }
  | { type: 'residual'; field: string; iteration: number; value: number }
  | { type: 'exit'; cmd: string; code: number }
  | { type: 'error'; message: string }
  | { type: 'diagnosis'; result: unknown }
  | { type: 'exhausted' }
  | { type: 'unknown-error'; log: string }
  | { type: 'done' }

interface StreamHandle {
  abort: () => void
}

async function* iterateSSE(res: Response): AsyncGenerator<unknown, void, void> {
  if (!res.ok || !res.body) {
    throw new Error(`SSE request failed: ${res.status} ${res.statusText}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 2)
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload) continue
        try {
          yield JSON.parse(payload)
        } catch {
          // Ignore malformed frames — backend is the only writer, this should
          // never happen in practice.
        }
      }
    }
  }
}

export function streamGenerate(
  projectId: string,
  prompt: string,
  handlers: {
    onEvent?: (e: GenerateEvent) => void
    onError?: (err: Error) => void
    onClose?: () => void
  },
): StreamHandle {
  const ctrl = new AbortController()
  ;(async () => {
    try {
      const res = await fetch(backendUrl(`/api/projects/${projectId}/generate`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: ctrl.signal,
      })
      for await (const evt of iterateSSE(res)) {
        handlers.onEvent?.(evt as GenerateEvent)
      }
      handlers.onClose?.()
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') {
        handlers.onClose?.()
        return
      }
      handlers.onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  })()
  return { abort: () => ctrl.abort() }
}

export type PostprocessEvent =
  | { type: 'log'; line: string }
  | { type: 'exit'; cmd: string; code: number }
  | { type: 'error'; message: string }
  | { type: 'done' }

/** Re-runs foamToVTK on a solved case so the Results tab has data. */
export function streamPostprocess(
  projectId: string,
  handlers: {
    onEvent?: (e: PostprocessEvent) => void
    onError?: (err: Error) => void
    onClose?: () => void
  },
  fields?: string[],
): StreamHandle {
  const ctrl = new AbortController()
  ;(async () => {
    try {
      const res = await fetch(backendUrl(`/api/projects/${projectId}/postprocess`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields ? { fields } : {}),
        signal: ctrl.signal,
      })
      for await (const evt of iterateSSE(res)) {
        handlers.onEvent?.(evt as PostprocessEvent)
      }
      handlers.onClose?.()
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') {
        handlers.onClose?.()
        return
      }
      handlers.onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  })()
  return { abort: () => ctrl.abort() }
}

export function streamRun(
  projectId: string,
  handlers: {
    onEvent?: (e: RunEvent) => void
    onError?: (err: Error) => void
    onClose?: () => void
  },
): StreamHandle {
  const ctrl = new AbortController()
  ;(async () => {
    try {
      const res = await fetch(backendUrl(`/api/projects/${projectId}/run`), {
        method: 'POST',
        signal: ctrl.signal,
      })
      for await (const evt of iterateSSE(res)) {
        handlers.onEvent?.(evt as RunEvent)
      }
      handlers.onClose?.()
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') {
        handlers.onClose?.()
        return
      }
      handlers.onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  })()
  return { abort: () => ctrl.abort() }
}
