import { create } from 'zustand'
import { streamRun, type RunEvent } from '@/lib/sse'
import * as api from '@/lib/api'
import { backendUrl } from '@/lib/backendUrl'

export interface FileFix {
  file: string
  description: string
  oldValue: string
  newValue: string
}

export interface DiagnosisResult {
  errorClass: string
  description: string
  fix: FileFix[]
}

export interface ResidualPoint {
  field: string
  iteration: number
  value: number
}

export type RunStatus = 'idle' | 'running' | 'success' | 'failed' | 'exhausted' | 'aborted'

interface RunsState {
  status: RunStatus
  log: string[] // raw log lines
  residuals: ResidualPoint[]
  exits: { cmd: string; code: number }[]
  diagnosis: DiagnosisResult | null
  unknownErrorTail: string | null
  errorMessage: string | null
  applying: boolean
  abort: (() => void) | null
  currentRunId: string | null

  // Historical viewing — when set, LogsTab renders the historical run instead
  // of live state. Only relevant when live status is idle.
  viewing: 'live' | 'historical'
  historicalRunId: string | null
  historicalLog: string[]
  historicalRecord: api.RunRecord | null
  historicalLoading: boolean
  historicalError: string | null

  startRun: (projectId: string) => void
  cancel: () => void
  applyFix: (projectId: string, fix: FileFix[]) => Promise<void>
  viewHistoricalRun: (projectId: string, run: api.RunRecord) => Promise<void>
  viewLiveRun: () => void
  reset: () => void
}

const initial = {
  status: 'idle' as RunStatus,
  log: [] as string[],
  residuals: [] as ResidualPoint[],
  exits: [] as { cmd: string; code: number }[],
  diagnosis: null as DiagnosisResult | null,
  unknownErrorTail: null as string | null,
  errorMessage: null as string | null,
  applying: false,
  abort: null as (() => void) | null,
  currentRunId: null as string | null,
  viewing: 'live' as 'live' | 'historical',
  historicalRunId: null as string | null,
  historicalLog: [] as string[],
  historicalRecord: null as api.RunRecord | null,
  historicalLoading: false,
  historicalError: null as string | null,
}

// Caps prevent unbounded array growth during long runs (10k+ log lines would
// OOM the Electron renderer). The on-disk runs/<runId>.log is the authoritative
// full log; here we keep only the tail for live display. Trim is amortized:
// only slice when the array grows past 1.5x the cap, so per-event cost is O(1).
const MAX_LOG = 5000
const MAX_RESIDUALS = 2000
const TRIM_THRESHOLD = 1.5

/**
 * Reduce a single SSE run event into a partial state update. Pulled out so
 * both `startRun` (via streamRun) and `applyFix` (which manually consumes the
 * apply-fix endpoint's SSE response) share the same logic.
 */
function reduceRunEvent(state: typeof initial, e: RunEvent): Partial<typeof initial> {
  if (e.type === 'run-started') return { currentRunId: e.runId }
  if (e.type === 'log') {
    const next = [...state.log, e.line]
    return next.length > MAX_LOG * TRIM_THRESHOLD
      ? { log: next.slice(-MAX_LOG) }
      : { log: next }
  }
  if (e.type === 'residual') {
    const next = [
      ...state.residuals,
      { field: e.field, iteration: e.iteration, value: e.value },
    ]
    return next.length > MAX_RESIDUALS * TRIM_THRESHOLD
      ? { residuals: next.slice(-MAX_RESIDUALS) }
      : { residuals: next }
  }
  if (e.type === 'exit') return { exits: [...state.exits, { cmd: e.cmd, code: e.code }] }
  if (e.type === 'error') {
    return { errorMessage: e.message, status: state.status === 'running' ? 'failed' : state.status }
  }
  if (e.type === 'diagnosis') {
    return { diagnosis: e.result as DiagnosisResult, status: 'failed' }
  }
  if (e.type === 'exhausted') return { status: 'exhausted' }
  if (e.type === 'unknown-error') return { unknownErrorTail: e.log, status: 'failed' }
  if (e.type === 'done') {
    return state.status === 'running' ? { status: 'success' } : {}
  }
  return {}
}

export const useRunsStore = create<RunsState>((set, get) => ({
  ...initial,

  startRun: (projectId) => {
    if (get().status === 'running' || get().applying) return
    set({ ...initial, status: 'running', viewing: 'live' })

    const handle = streamRun(projectId, {
      onEvent: (e) => set((s) => reduceRunEvent(s, e)),
      onError: (err) => set({ status: 'failed', errorMessage: err.message, abort: null }),
      onClose: () =>
        set((s) => (s.status === 'running' ? { status: 'aborted', abort: null } : { abort: null })),
    })
    set({ abort: handle.abort })
  },

  cancel: () => {
    get().abort?.()
    set({ status: 'aborted', abort: null })
  },

  applyFix: async (projectId, fix) => {
    if (get().applying) return
    set({ applying: true, errorMessage: null })
    try {
      const res = await fetch(backendUrl(`/api/projects/${projectId}/apply-fix`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fix }),
      })
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => '')
        throw new Error(`apply-fix failed: ${res.status} ${txt}`)
      }
      // apply-fix responds with a fresh /run-style SSE stream after writing.
      set({ ...initial, status: 'running', applying: false, viewing: 'live' })
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
            try {
              const evt = JSON.parse(line.slice(5).trim()) as RunEvent
              set((s) => reduceRunEvent(s, evt))
            } catch {
              /* ignore malformed frames */
            }
          }
        }
      }
      set((s) => (s.status === 'running' ? { status: 'success', abort: null } : { abort: null }))
    } catch (err) {
      set({
        applying: false,
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
        abort: null,
      })
    }
  },

  viewHistoricalRun: async (projectId, run) => {
    set({
      viewing: 'historical',
      historicalRunId: run.id,
      historicalRecord: run,
      historicalLog: [],
      historicalLoading: true,
      historicalError: null,
    })
    try {
      const text = await api.getRunLog(projectId, run.id)
      const lines = text.split('\n')
      // Drop trailing empty line from final '\n'
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
      set({ historicalLog: lines, historicalLoading: false })
    } catch (err) {
      set({
        historicalLoading: false,
        historicalError: err instanceof Error ? err.message : String(err),
      })
    }
  },

  viewLiveRun: () => set({ viewing: 'live' }),

  reset: () => {
    get().abort?.()
    set({ ...initial })
  },
}))
