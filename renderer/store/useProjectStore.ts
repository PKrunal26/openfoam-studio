import { create } from 'zustand'
import * as api from '../lib/api'

interface ProjectState {
  executionAllowed: boolean
  setExecutionAllowed: (allowed: boolean) => void
  project: api.ProjectMeta | null
  files: api.CaseFile[]
  loading: boolean
  error: string | null
  loadProject: (id: string) => Promise<void>
  refreshFiles: () => Promise<void>
  clear: () => void
}

let requestToken = 0

export const useProjectStore = create<ProjectState>((set, get) => ({
  executionAllowed: false,
  setExecutionAllowed: (executionAllowed) => set({ executionAllowed }),
  project: null,
  files: [],
  loading: false,
  error: null,

  loadProject: async (id) => {
    const token = ++requestToken
    set({ project: null, files: [], loading: true, error: null })
    try {
      const [project, files] = await Promise.all([api.getProject(id), api.listFiles(id)])
      if (token !== requestToken) return
      if (!project) throw new Error('Project not found')
      set({ project, files, loading: false })
    } catch (err) {
      if (token !== requestToken) return
      set({ loading: false, error: err instanceof Error ? err.message : String(err) })
    }
  },

  refreshFiles: async () => {
    const id = get().project?.id
    if (!id) return
    try {
      const [files, project] = await Promise.all([api.listFiles(id), api.getProject(id)])
      if (get().project?.id !== id) return
      set({ files, ...(project ? { project } : {}) })
    } catch {
      // non-fatal — keep stale tree
    }
  },

  clear: () => { requestToken++; set({ project: null, files: [], loading: false, error: null }) },
}))
