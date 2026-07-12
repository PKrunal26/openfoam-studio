import { create } from 'zustand'
import * as api from '@/lib/api'

interface ProjectState {
  project: api.ProjectMeta | null
  files: api.CaseFile[]
  loading: boolean
  error: string | null
  loadProject: (id: string) => Promise<void>
  refreshFiles: () => Promise<void>
  clear: () => void
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,
  files: [],
  loading: false,
  error: null,

  loadProject: async (id) => {
    set({ loading: true, error: null })
    try {
      const [project, files] = await Promise.all([api.getProject(id), api.listFiles(id)])
      if (!project) throw new Error('Project not found')
      set({ project, files, loading: false })
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) })
    }
  },

  refreshFiles: async () => {
    const id = get().project?.id
    if (!id) return
    try {
      const files = await api.listFiles(id)
      set({ files })
    } catch {
      // non-fatal — keep stale tree
    }
  },

  clear: () => set({ project: null, files: [], loading: false, error: null }),
}))
