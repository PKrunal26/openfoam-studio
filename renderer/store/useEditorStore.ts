import { create } from 'zustand'
import * as api from '@/lib/api'

export type TabKind = 'case' | 'parameters' | 'logs' | 'geometry' | 'visualization'

export interface EditorTab {
  id: string
  kind: TabKind
  label: string
  // Case-file specifics
  relPath?: string
  content?: string
  savedContent?: string
  loading?: boolean
  error?: string | null
}

interface EditorState {
  tabs: EditorTab[]
  activeId: string | null
  openCaseFile: (projectId: string, relPath: string) => Promise<void>
  openSpecialTab: (kind: Exclude<TabKind, 'case'>, label: string) => void
  closeTab: (id: string) => void
  setActive: (id: string) => void
  updateContent: (id: string, content: string) => void
  saveTab: (projectId: string, id: string) => Promise<void>
  reset: () => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activeId: null,

  openCaseFile: async (projectId, relPath) => {
    const id = `case:${relPath}`
    const existing = get().tabs.find((t) => t.id === id)
    if (existing) {
      set({ activeId: id })
      return
    }
    const placeholder: EditorTab = {
      id,
      kind: 'case',
      label: relPath.split('/').pop() ?? relPath,
      relPath,
      loading: true,
      error: null,
    }
    set((s) => ({ tabs: [...s.tabs, placeholder], activeId: id }))
    try {
      const content = await api.readFile(projectId, relPath)
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === id ? { ...t, content, savedContent: content, loading: false } : t,
        ),
      }))
    } catch (err) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === id
            ? { ...t, loading: false, error: err instanceof Error ? err.message : String(err) }
            : t,
        ),
      }))
    }
  },

  openSpecialTab: (kind, label) => {
    const id = `special:${kind}`
    const existing = get().tabs.find((t) => t.id === id)
    if (existing) {
      set({ activeId: id })
      return
    }
    const tab: EditorTab = { id, kind, label }
    set((s) => ({ tabs: [...s.tabs, tab], activeId: id }))
  },

  closeTab: (id) =>
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id)
      if (idx < 0) return s
      const tabs = s.tabs.filter((t) => t.id !== id)
      let activeId = s.activeId
      if (activeId === id) {
        activeId = tabs[idx]?.id ?? tabs[idx - 1]?.id ?? null
      }
      return { tabs, activeId }
    }),

  setActive: (id) => set({ activeId: id }),

  updateContent: (id, content) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, content } : t)),
    })),

  saveTab: async (projectId, id) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (!tab || tab.kind !== 'case' || !tab.relPath || tab.content == null) return
    await api.writeFile(projectId, tab.relPath, tab.content)
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, savedContent: t.content } : t)),
    }))
  },

  reset: () => set({ tabs: [], activeId: null }),
}))
