import { create } from 'zustand'
import { streamGenerate, type GenerateEvent } from '@/lib/sse'
import { backendUrl } from '@/lib/backendUrl'

export interface PersistedAgentStep {
  tool: string
  summary?: string
  ok: boolean
  durationMs?: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  ts?: string
  filesChanged?: string[]
  /** Compact tool-call trail from the turn that produced this message. */
  agentSteps?: PersistedAgentStep[]
}

export interface AgentToolCall {
  id: string
  tool: string
  args: unknown
  status: 'running' | 'ok' | 'failed'
  preview?: string
  /** Live stdout lines for tools that stream (run_command). */
  lines?: string[]
  durationMs?: number
}

export interface AgentStep {
  index: number
  thoughts?: string
  toolCalls: AgentToolCall[]
}

export interface StreamingState {
  status: string // top-line label, e.g. "Generating files…"
  thinking: string // current heartbeat / stage label
  elapsed: number // seconds since start
  filesWritten: string[] // case-relative paths streamed so far
  error: string | null
  /** Agent-loop step history. Empty for legacy single-pass generation. */
  agentSteps: AgentStep[]
  /** Tool calls observed before the first agent-step event closes. */
  pendingToolCalls: AgentToolCall[]
  /** Final summary text emitted by the agent's `finish` tool, if any. */
  finishSummary?: string
}

interface ChatState {
  messages: ChatMessage[]
  streaming: StreamingState | null
  abort: (() => void) | null

  setMessages: (messages: ChatMessage[]) => void
  reset: () => void

  /**
   * Send a prompt for the given project. Pushes the user message immediately,
   * then opens the SSE stream and updates streaming/messages live.
   */
  sendPrompt: (
    projectId: string,
    prompt: string,
    callbacks?: { onFilesWritten?: () => void },
  ) => void

  cancel: () => void

  /**
   * Clear the persisted chat history for a project (DELETE endpoint).
   */
  clearHistory: (projectId: string) => Promise<void>
}

function summarizeCallArgs(tool: string, args: unknown): string | undefined {
  if (!args || typeof args !== 'object') return undefined
  const a = args as Record<string, unknown>
  for (const k of ['path', 'query', 'cmd']) {
    if (typeof a[k] === 'string' && a[k]) return a[k] as string
  }
  return undefined
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  streaming: null,
  abort: null,

  setMessages: (messages) => set({ messages }),

  reset: () => {
    get().abort?.()
    set({ messages: [], streaming: null, abort: null })
  },

  sendPrompt: (projectId, prompt, callbacks) => {
    if (get().streaming) return // already streaming

    const trimmed = prompt.trim()
    if (!trimmed) return

    const userMsg: ChatMessage = { role: 'user', content: trimmed, ts: new Date().toISOString() }
    set((s) => ({
      messages: [...s.messages, userMsg],
      streaming: {
        status: 'Starting…',
        thinking: '',
        elapsed: 0,
        filesWritten: [],
        error: null,
        agentSteps: [],
        pendingToolCalls: [],
      },
    }))

    const handle = streamGenerate(projectId, trimmed, {
      onEvent: (e: GenerateEvent) => {
        set((s) => {
          if (!s.streaming) return s
          if (e.type === 'status') {
            return { streaming: { ...s.streaming, status: e.message } }
          }
          if (e.type === 'thinking') {
            return {
              streaming: {
                ...s.streaming,
                thinking: e.message,
                elapsed: e.elapsed ?? s.streaming.elapsed,
              },
            }
          }
          if (e.type === 'file') {
            if (s.streaming.filesWritten.includes(e.path)) return s
            return {
              streaming: {
                ...s.streaming,
                filesWritten: [...s.streaming.filesWritten, e.path],
              },
            }
          }
          if (e.type === 'tool-call') {
            const call: AgentToolCall = {
              id: e.id,
              tool: e.tool,
              args: e.args,
              status: 'running',
            }
            return {
              streaming: {
                ...s.streaming,
                pendingToolCalls: [...s.streaming.pendingToolCalls, call],
              },
            }
          }
          if (e.type === 'tool-progress') {
            const update = (call: AgentToolCall) =>
              call.id === e.id
                ? { ...call, lines: [...(call.lines ?? []), e.line].slice(-40) }
                : call
            return {
              streaming: {
                ...s.streaming,
                pendingToolCalls: s.streaming.pendingToolCalls.map(update),
                agentSteps: s.streaming.agentSteps.map((step) => ({
                  ...step,
                  toolCalls: step.toolCalls.map(update),
                })),
              },
            }
          }
          if (e.type === 'tool-result') {
            const update = (call: AgentToolCall) =>
              call.id === e.id
                ? {
                    ...call,
                    status: e.ok ? ('ok' as const) : ('failed' as const),
                    preview: e.preview,
                    durationMs: e.durationMs,
                  }
                : call
            return {
              streaming: {
                ...s.streaming,
                pendingToolCalls: s.streaming.pendingToolCalls.map(update),
                agentSteps: s.streaming.agentSteps.map((step) => ({
                  ...step,
                  toolCalls: step.toolCalls.map(update),
                })),
              },
            }
          }
          if (e.type === 'agent-step') {
            const newStep: AgentStep = {
              index: e.index,
              thoughts: e.text,
              toolCalls: s.streaming.pendingToolCalls,
            }
            return {
              streaming: {
                ...s.streaming,
                agentSteps: [...s.streaming.agentSteps, newStep],
                pendingToolCalls: [],
              },
            }
          }
          if (e.type === 'finish' || e.type === 'finish-summary') {
            return {
              streaming: { ...s.streaming, finishSummary: e.summary },
            }
          }
          if (e.type === 'error') {
            return {
              streaming: { ...s.streaming, error: e.message },
            }
          }
          if (e.type === 'done') {
            // Synthesize the assistant message client-side. Backend persists
            // its own copy with the same shape; mismatches resolve on reload.
            // Changed files render as chips from `filesChanged` — the text is
            // just the agent's summary.
            const files = s.streaming.filesWritten
            const finish = s.streaming.finishSummary?.trim()
            const summary =
              finish ||
              (files.length > 0
                ? `Updated ${files.length} file${files.length === 1 ? '' : 's'}.`
                : 'No files needed to change.')
            const steps: PersistedAgentStep[] = [
              ...s.streaming.agentSteps.flatMap((st) => st.toolCalls),
              ...s.streaming.pendingToolCalls,
            ].map((c) => ({
              tool: c.tool,
              summary: summarizeCallArgs(c.tool, c.args),
              ok: c.status !== 'failed',
              durationMs: c.durationMs,
            }))
            const assistantMsg: ChatMessage = {
              role: 'assistant',
              content: summary,
              ts: new Date().toISOString(),
              filesChanged: files,
              agentSteps: steps.length > 0 ? steps : undefined,
            }
            // Fire callback after settling state.
            queueMicrotask(() => callbacks?.onFilesWritten?.())
            return {
              messages: [...s.messages, assistantMsg],
              streaming: null,
              abort: null,
            }
          }
          return s
        })
      },
      onError: (err) => {
        set((s) => ({
          streaming: s.streaming ? { ...s.streaming, error: err.message } : null,
        }))
      },
      onClose: () => {
        set((s) => {
          if (!s.streaming) return { abort: null }
          // Stream closed without `done` (network drop or abort). Drop streaming
          // state; keep any error message in chat as a synthetic assistant note.
          if (s.streaming.error) {
            const errMsg: ChatMessage = {
              role: 'assistant',
              content: `Error: ${s.streaming.error}`,
              ts: new Date().toISOString(),
            }
            return { messages: [...s.messages, errMsg], streaming: null, abort: null }
          }
          return { streaming: null, abort: null }
        })
      },
    })

    set({ abort: handle.abort })
  },

  cancel: () => {
    get().abort?.()
    set({ streaming: null, abort: null })
  },

  clearHistory: async (projectId) => {
    const res = await fetch(backendUrl(`/api/projects/${projectId}/messages`), { method: 'DELETE' })
    if (!res.ok && res.status !== 404) {
      throw new Error(`Failed to clear: ${res.status}`)
    }
    set({ messages: [], streaming: null })
  },
}))
