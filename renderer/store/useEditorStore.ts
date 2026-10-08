import { create } from 'zustand'
import * as api from '../lib/api'

export type TabKind = 'case' | 'parameters' | 'logs' | 'geometry' | 'visualization'
export interface EditorTab {
  id: string
  kind: TabKind
  label: string
  instance?: number
  projectId?: string
  relPath?: string
  content?: string
  savedContent?: string
  loading?: boolean
  saving?: boolean
  error?: string | null
  saveError?: string | null
  conflict?: boolean
  validationError?: string | null
  parameterDrafts?: Record<string, string>
}
export const isDirty = (tab: EditorTab) => tab.kind === 'case' && tab.savedContent != null && (tab.content !== tab.savedContent || !!tab.validationError)
interface EditorState {
  tabs: EditorTab[]
  activeId: string | null
  epoch: number
  pending: { action: () => void; ids: string[] } | null
  openCaseFile: (projectId: string, relPath: string) => Promise<void>
  openSpecialTab: (kind: Exclude<TabKind, 'case'>, label: string) => void
  closeTab: (id: string) => void
  guard: (action: () => void, ids?: string[]) => void
  settlePending: (decision: 'save' | 'discard' | 'cancel') => Promise<void>
  setActive: (id: string) => void
  updateContent: (id: string, content: string) => void
  saveTab: (projectId: string, id: string) => Promise<void>
  saveAll: (projectId: string) => Promise<void>
  reloadFiles: (projectId: string, discardId?: string) => Promise<void>
  reset: () => void
}
let nextInstance = 0
export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [], activeId: null, epoch: 0, pending: null,
  openCaseFile: async (projectId, relPath) => {
    const id = `case:${relPath}`
    if (get().tabs.some((t) => t.id === id)) { set({ activeId: id }); return }
    const epoch = get().epoch
    const instance = ++nextInstance
    set((s) => ({ tabs: [...s.tabs, { id, instance, kind: 'case', projectId, label: relPath.split('/').pop() ?? relPath, relPath, loading: true }], activeId: id }))
    try {
      const content = await api.readFile(projectId, relPath)
      if (get().epoch !== epoch) return
      set((s) => ({ tabs: s.tabs.map((t) => t.id === id && t.instance === instance ? { ...t, content, savedContent: content, loading: false } : t) }))
    } catch (err) {
      if (get().epoch !== epoch) return
      set((s) => ({ tabs: s.tabs.map((t) => t.id === id && t.instance === instance ? { ...t, loading: false, error: String(err) } : t) }))
    }
  },
  openSpecialTab: (kind, label) => {
    const id = `special:${kind}`
    set((s) => ({ tabs: s.tabs.some((t) => t.id === id) ? s.tabs : [...s.tabs, { id, kind, label }], activeId: id }))
  },
  guard: (action, ids) => {
    const dirtyIds = get().tabs.filter((t) => isDirty(t) && (!ids || ids.includes(t.id))).map((t) => t.id)
    if (dirtyIds.length) set({ pending: { action, ids: dirtyIds } })
    else action()
  },
  settlePending: async (decision) => {
    const pending = get().pending
    if (!pending) return
    if (decision === 'cancel') { set({ pending: null }); return }
    if (decision === 'save') {
      for (const id of pending.ids) {
        const tab = get().tabs.find((t) => t.id === id)
        if (tab?.projectId) await get().saveTab(tab.projectId, id)
      }
      if (get().tabs.some((t) => pending.ids.includes(t.id) && isDirty(t))) throw new Error('Files changed during saving. Review and save again.')
    }
    set({ pending: null })
    pending.action()
  },
  closeTab: (id) => get().guard(() => set((s) => {
    const idx = s.tabs.findIndex((t) => t.id === id)
    const tabs = s.tabs.filter((t) => t.id !== id)
    return { tabs, activeId: s.activeId === id ? tabs[idx]?.id ?? tabs[idx - 1]?.id ?? null : s.activeId }
  }), [id]),
  setActive: (activeId) => set({ activeId }),
  updateContent: (id, content) => set((s) => ({ tabs: s.tabs.map((t) => t.id === id ? { ...t, content, validationError: null, parameterDrafts: undefined } : t) })),
  saveTab: async (projectId, id) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (!tab || tab.kind !== 'case' || !tab.relPath || tab.content == null) return
    if (tab.projectId !== projectId) throw new Error('Project changed before the save. Your edits are preserved.')
    if (tab.validationError) throw new Error(tab.validationError)
    if (tab.saving) throw new Error('A save is already in progress.')
    const epoch = get().epoch
    const submitted = tab.content
    set((s) => ({ tabs: s.tabs.map((t) => t.id === id ? { ...t, saving: true, saveError: null } : t) }))
    try {
      await api.writeFile(projectId, tab.relPath, submitted, tab.savedContent)
      if (get().epoch !== epoch) return
      set((s) => ({ tabs: s.tabs.map((t) => t.id === id && t.instance === tab.instance ? { ...t, savedContent: submitted, parameterDrafts: t.content === submitted ? undefined : t.parameterDrafts, saving: false, conflict: false } : t) }))
    } catch (err) {
      if (get().epoch === epoch) set((s) => ({ tabs: s.tabs.map((t) => t.id === id && t.instance === tab.instance ? { ...t, saving: false, saveError: err instanceof Error ? err.message : String(err), conflict: err instanceof api.FileConflictError } : t) }))
      throw err
    }
  },
  saveAll: async (projectId) => {
    const epoch = get().epoch
    for (const tab of get().tabs.filter(isDirty)) {
      if (get().epoch !== epoch) throw new Error('Project changed while saving.')
      await get().saveTab(projectId, tab.id)
    }
    if (get().epoch !== epoch) throw new Error('Project changed while saving.')
    if (get().tabs.some(isDirty)) throw new Error('Files changed during saving. Save again before running.')
  },
  reloadFiles: async (projectId, discardId) => {
    const epoch = get().epoch
    await Promise.all(get().tabs.filter((t) => t.kind === 'case' && t.projectId === projectId && t.relPath).map(async (tab) => {
      try {
        const content = await api.readFile(projectId, tab.relPath!)
        if (get().epoch !== epoch) return
        set((s) => ({ tabs: s.tabs.map((t) => {
          if (t.id !== tab.id || t.instance !== tab.instance || t.savedContent !== tab.savedContent) return t
          if (isDirty(t) && discardId !== t.id) return content !== t.savedContent ? { ...t, conflict: true, saveError: 'This file changed on disk. Your edits are preserved. Copy them before reloading the disk version.' } : t
          return { ...t, content, savedContent: content, validationError: null, parameterDrafts: undefined, conflict: false, error: null, saveError: null }
        }) }))
      } catch (err) {
        if (get().epoch === epoch) set((s) => ({ tabs: s.tabs.map((t) => t.id === tab.id ? { ...t, saveError: String(err) } : t) }))
      }
    }))
  },
  reset: () => set((s) => ({ tabs: [], activeId: null, pending: null, epoch: s.epoch + 1 })),
}))
