import { create } from 'zustand'
import { api, ApiError, isActive, type SessionInfo, type TutorialDef, type Value, type WorkspaceView } from './api'

// ── Session ──────────────────────────────────────────────────────────────────

interface SessionState {
  info: SessionInfo | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

export const useSession = create<SessionState>((set) => ({
  info: null,
  loading: true,
  error: null,
  refresh: async () => {
    try {
      set({ info: await api.session(), loading: false, error: null })
    } catch (error) {
      set({ loading: false, error: (error as Error).message })
    }
  },
  logout: async () => {
    await api.logout().catch(() => undefined)
    set({ info: await api.session().catch(() => null) })
  },
}))

// ── Toasts ───────────────────────────────────────────────────────────────────

export interface Toast { id: number; kind: 'info' | 'success' | 'error'; text: string }
interface ToastState {
  toasts: Toast[]
  push: (kind: Toast['kind'], text: string) => void
  dismiss: (id: number) => void
}
let toastId = 0
export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, text) => {
    const id = ++toastId
    set((state) => ({ toasts: [...state.toasts.slice(-3), { id, kind, text }] }))
    setTimeout(() => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })), kind === 'error' ? 8000 : 4500)
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}))

// ── Workbench ────────────────────────────────────────────────────────────────

export type RunViewKind = 'settings' | 'convergence' | 'fields' | 'log'

export type Selection =
  | { kind: 'geometry' }
  | { kind: 'item'; itemId: string }
  | { kind: 'files'; path?: string }
  | { kind: 'run'; runId: string; view: RunViewKind }

export interface DisplayState {
  field: string
  /** -1 = magnitude */
  component: -1 | 0 | 1 | 2
  colormap: string
  rangeMode: 'step' | 'all'
  edges: boolean
  slice: boolean
  sliceAxis: 0 | 1 | 2
  /** 0–1 across the domain along sliceAxis */
  slicePosition: number
  vectors: boolean
  stepIndex: number
  playing: boolean
}

interface WorkbenchState {
  tutorialId: string | null
  tutorial: TutorialDef | null
  guide: string
  workspace: WorkspaceView | null
  loading: boolean
  loadError: string | null
  selection: Selection
  /** Per-parameter rejection messages from the last save attempt. */
  fieldErrors: Record<string, string>
  saving: boolean
  starting: boolean
  display: DisplayState
  guideOpen: boolean
  /** Patch hovered/selected in the geometry list. */
  focusPatch: string | null
  hiddenPatches: string[]

  load: (tutorialId: string) => Promise<void>
  unload: () => void
  select: (selection: Selection) => void
  setValue: (paramId: string, value: Value) => Promise<void>
  resetAll: () => Promise<void>
  resetParams: (paramIds: string[]) => Promise<void>
  startRun: () => Promise<void>
  deleteRun: (runId: string) => Promise<void>
  cancelRun: (runId: string) => Promise<void>
  poll: () => Promise<void>
  applyWorkspace: (workspace: WorkspaceView) => void
  setDisplay: (patch: Partial<DisplayState>) => void
  setGuideOpen: (open: boolean) => void
  setFocusPatch: (patch: string | null) => void
  togglePatch: (patch: string) => void
}

function defaultDisplay(tutorial: TutorialDef | null): DisplayState {
  return {
    field: tutorial?.results.defaultField ?? 'U',
    component: -1,
    colormap: 'rainbow',
    rangeMode: 'all',
    edges: false,
    slice: !!tutorial?.results.slice,
    sliceAxis: tutorial?.results.slice ? (tutorial.results.slice.normal.findIndex((n) => Math.abs(n) > 0.5) as 0 | 1 | 2) : 2,
    slicePosition: 0.5,
    vectors: false,
    stepIndex: -1,
    playing: false,
  }
}

function report(error: unknown): void {
  useToasts.getState().push('error', error instanceof ApiError || error instanceof Error ? error.message : 'Something went wrong')
}

export const useWorkbench = create<WorkbenchState>((set, get) => ({
  tutorialId: null,
  tutorial: null,
  guide: '',
  workspace: null,
  loading: false,
  loadError: null,
  selection: { kind: 'geometry' },
  fieldErrors: {},
  saving: false,
  starting: false,
  display: defaultDisplay(null),
  guideOpen: typeof window === 'undefined' || window.innerWidth >= 1560,
  focusPatch: null,
  hiddenPatches: [],

  load: async (tutorialId) => {
    set({ tutorialId, tutorial: null, workspace: null, loading: true, loadError: null, selection: { kind: 'geometry' }, fieldErrors: {}, focusPatch: null, hiddenPatches: [] })
    try {
      const data = await api.tutorial(tutorialId)
      if (get().tutorialId !== tutorialId) return
      set({ tutorial: data.tutorial, guide: data.guide, workspace: data.workspace, loading: false, display: defaultDisplay(data.tutorial) })
    } catch (error) {
      if (get().tutorialId === tutorialId) set({ loading: false, loadError: (error as Error).message })
    }
  },
  unload: () => set({ tutorialId: null, tutorial: null, workspace: null }),

  select: (selection) => {
    const previous = get().selection
    set({ selection, focusPatch: null })
    // Opening a different run's fields starts from its last time step.
    if (selection.kind === 'run' && selection.view === 'fields' && (previous.kind !== 'run' || previous.runId !== selection.runId)) {
      set((state) => ({ display: { ...state.display, stepIndex: -1, playing: false } }))
    }
  },

  setValue: async (paramId, value) => {
    const { tutorialId } = get()
    if (!tutorialId) return
    set({ saving: true })
    try {
      const workspace = await api.setValues(tutorialId, { [paramId]: value })
      set((state) => {
        const fieldErrors = { ...state.fieldErrors }
        delete fieldErrors[paramId]
        return { workspace, fieldErrors, saving: false }
      })
    } catch (error) {
      set((state) => ({ saving: false, fieldErrors: { ...state.fieldErrors, [paramId]: (error as Error).message } }))
    }
  },

  resetAll: async () => {
    const { tutorialId } = get()
    if (!tutorialId) return
    try { set({ workspace: await api.resetWorkspace(tutorialId), fieldErrors: {} }) } catch (error) { report(error) }
  },

  resetParams: async (paramIds) => {
    const { tutorialId, tutorial } = get()
    if (!tutorialId || !tutorial) return
    const values: Record<string, Value> = {}
    for (const def of tutorial.params) if (paramIds.includes(def.id)) values[def.id] = def.default
    try {
      const workspace = await api.setValues(tutorialId, values)
      set((state) => {
        const fieldErrors = { ...state.fieldErrors }
        for (const id of paramIds) delete fieldErrors[id]
        return { workspace, fieldErrors }
      })
    } catch (error) { report(error) }
  },

  startRun: async () => {
    const { tutorialId, starting } = get()
    if (!tutorialId || starting) return
    set({ starting: true })
    try {
      const { runId, workspace } = await api.createRun(tutorialId)
      const run = workspace.runs.find((candidate) => candidate.id === runId)
      set({ workspace, starting: false })
      if (run?.status === 'succeeded') {
        useToasts.getState().push('success', `${run.label}: results were already available for these settings: no compute needed.`)
        get().select({ kind: 'run', runId, view: 'fields' })
      } else {
        if (run?.status === 'failed') useToasts.getState().push('error', `${run.label}: these exact settings were already solved and failed. ${run.reason ?? ''}`)
        get().select({ kind: 'run', runId, view: 'log' })
      }
    } catch (error) {
      set({ starting: false })
      report(error)
    }
  },

  deleteRun: async (runId) => {
    const { tutorialId, selection } = get()
    if (!tutorialId) return
    try {
      const workspace = await api.deleteRun(tutorialId, runId)
      set({ workspace })
      if (selection.kind === 'run' && selection.runId === runId) set({ selection: { kind: 'geometry' } })
    } catch (error) { report(error) }
  },

  cancelRun: async (runId) => {
    const { tutorialId } = get()
    if (!tutorialId) return
    try { get().applyWorkspace(await api.cancelRun(tutorialId, runId)) } catch (error) { report(error) }
  },

  poll: async () => {
    const { tutorialId } = get()
    if (!tutorialId) return
    try {
      const workspace = await api.workspace(tutorialId)
      if (get().tutorialId === tutorialId) get().applyWorkspace(workspace)
    } catch { /* transient; the next poll retries */ }
  },

  applyWorkspace: (workspace) => {
    const previous = get().workspace
    set({ workspace })
    if (!previous) return
    for (const run of workspace.runs) {
      const before = previous.runs.find((candidate) => candidate.id === run.id)
      if (!before || !isActive(before.status) || isActive(run.status)) continue
      const { selection } = get()
      const watching = selection.kind === 'run' && selection.runId === run.id
      if (run.status === 'succeeded') {
        useToasts.getState().push('success', `${run.label} finished. Results are ready.`)
        if (watching && selection.view === 'log') get().select({ kind: 'run', runId: run.id, view: 'fields' })
      } else if (run.status === 'failed') {
        useToasts.getState().push('error', `${run.label} failed: ${run.reason ?? 'see the solver log'}`)
      }
    }
  },

  setDisplay: (patch) => set((state) => ({ display: { ...state.display, ...patch } })),
  setGuideOpen: (guideOpen) => set({ guideOpen }),
  setFocusPatch: (focusPatch) => set({ focusPatch }),
  togglePatch: (patch) => set((state) => ({
    hiddenPatches: state.hiddenPatches.includes(patch) ? state.hiddenPatches.filter((p) => p !== patch) : [...state.hiddenPatches, patch],
  })),
}))

/** The setting item currently open in the settings panel, if any. */
export function findItem(tutorial: TutorialDef | null, itemId: string) {
  for (const section of tutorial?.sections ?? []) {
    const item = section.items.find((candidate) => candidate.id === itemId)
    if (item) return { section, item }
  }
  return null
}
