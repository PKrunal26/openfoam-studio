import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatStore } from '../../../renderer/store/useChatStore'
import { useRunsStore } from '../../../renderer/store/useRunsStore'
import { useProjectStore } from '../../../renderer/store/useProjectStore'
import type { GenerateEvent, RunEvent } from '../../../renderer/lib/sse'

const mocks = vi.hoisted(() => ({
  generation: [] as Array<{ intent?: 'question' | 'edit'; onEvent?: (e: GenerateEvent) => void; onError?: (e: Error) => void; onClose?: () => void }>,
  runs: [] as Array<{ onEvent?: (e: RunEvent) => void; onError?: (e: Error) => void; onClose?: () => void }>,
  abort: vi.fn(), fetch: vi.fn(),
}))
vi.mock('../../../renderer/lib/backendFetch', () => ({ backendFetch: mocks.fetch }))
vi.mock('../../../renderer/lib/sse', async (original) => {
  const actual = await original<typeof import('../../../renderer/lib/sse')>()
  return { ...actual,
    streamGenerate: vi.fn((_id, _prompt, handlers, intent) => { mocks.generation.push({ ...handlers, intent }); return { abort: mocks.abort } }),
    streamRun: vi.fn((_id, handlers) => { mocks.runs.push(handlers); return { abort: mocks.abort } }),
  }
})
beforeEach(() => { useChatStore.getState().reset(); useRunsStore.getState().reset(); useProjectStore.getState().clear(); mocks.generation.length = 0; mocks.runs.length = 0; vi.clearAllMocks() })
describe('project and job scope', () => {
  it('preserves an explicit question intent through the transport boundary', () => {
    useChatStore.getState().sendPrompt('a', 'Would this case converge?', { intent: 'question' })
    expect(mocks.generation[0]?.intent).toBe('question')
  })
  it('settles transport failures so the assistant can retry', () => {
    useChatStore.getState().sendPrompt('a', 'Explain this case')
    mocks.generation[0]!.onError?.(new Error('connection lost'))
    expect(useChatStore.getState().streaming).toBeNull()
    expect(useChatStore.getState().messages.at(-1)?.content).toContain('connection lost')
    useChatStore.getState().sendPrompt('a', 'Retry')
    expect(useChatStore.getState().streaming).not.toBeNull()
  })
  it('ignores late generation events from a cancelled project', () => {
    const refresh = vi.fn()
    useChatStore.getState().sendPrompt('a', 'Make a case', { onFilesWritten: refresh })
    useChatStore.getState().reset()
    useChatStore.getState().sendPrompt('b', 'Explain B')
    mocks.generation[0]!.onEvent?.({ type: 'done' })
    mocks.generation[0]!.onError?.(new Error('old error'))
    expect(useChatStore.getState().messages).toHaveLength(1)
    expect(useChatStore.getState().streaming).not.toBeNull()
    expect(refresh).not.toHaveBeenCalled()
  })
  it('ignores late run completion after cancellation and a new run', () => {
    useRunsStore.getState().startRun('a')
    useRunsStore.getState().cancel()
    useRunsStore.getState().startRun('b')
    mocks.runs[0]!.onEvent?.({ type: 'done', status: 'success' })
    mocks.runs[0]!.onClose?.()
    expect(useRunsStore.getState().status).toBe('running')
    expect(mocks.abort).toHaveBeenCalled()
  })
  it('treats a run stream ending without terminal confirmation as a failure', () => {
    useRunsStore.getState().startRun('a')
    mocks.runs[0]!.onClose?.()
    expect(useRunsStore.getState().status).toBe('failed')
    expect(useRunsStore.getState().errorMessage).toContain('before the run reported completion')
  })
  it('never promotes a failed command to success on a bare done event', () => {
    useRunsStore.getState().startRun('a')
    mocks.runs[0]!.onEvent?.({ type: 'exit', cmd: 'checkMesh', code: 1 })
    mocks.runs[0]!.onEvent?.({ type: 'done' })
    expect(useRunsStore.getState().status).toBe('failed')
  })
  it('does not claim recovery succeeded when its SSE stream simply ends', async () => {
    mocks.fetch.mockResolvedValue(new Response('data: {"type":"log","line":"starting"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } }))
    await useRunsStore.getState().applyFix('a', [])
    expect(useRunsStore.getState().status).toBe('failed')
    expect(useRunsStore.getState().errorMessage).toContain('before the server confirmed completion')
  })
})
