import { create } from 'zustand'
import type { ComponentSelector } from '@/lib/vtk/fieldStats'
import { VECTOR_MAGNITUDE } from '@/lib/vtk/fieldStats'
import type { RepresentationMode } from '@/lib/vtk/ResultsEngine'
import { DEFAULT_COLORMAP } from '@/lib/vtk/colormaps'

export type PipelineItemType =
  | 'mesh'
  | 'patch'
  // P1 derived objects:
  | 'slice'
  | 'clip'
  | 'glyphs'
  | 'streamlines'
  | 'iso'

export type RangeMode = 'auto' | 'allTime' | 'manual'

export interface PipelineItem {
  id: string
  type: PipelineItemType
  label: string
  visible: boolean
  /** null → solid color (no field coloring) */
  field: string | null
  component: ComponentSelector
  colormap: string
  rangeMode: RangeMode
  manualRange: [number, number]
  representation: RepresentationMode
  opacity: number
  /** 'patch' items only */
  patchName?: string
  /** P1 derived objects: filter parameters (plane origin/normal, iso value, ...) */
  params?: Record<string, unknown>
}

interface ResultsState {
  /** Project the current pipeline belongs to — items reset when it changes. */
  projectId: string | null
  items: PipelineItem[]
  selectedId: string | null
  timeIndex: number
  playing: boolean
  /** Playback speed in time steps per second. */
  speed: number
  background: 'dark' | 'light'
  /** Two-viewport compare: right viewport recolors surfaces by this field. */
  compareEnabled: boolean
  compareField: string | null
  compareComponent: ComponentSelector

  initPipeline: (projectId: string, fields: { name: string; numComponents: number }[], patchNames: string[]) => void
  addItem: (item: PipelineItem) => void
  removeItem: (id: string) => void
  updateItem: (id: string, patch: Partial<PipelineItem>) => void
  select: (id: string | null) => void
  setTimeIndex: (index: number) => void
  setPlaying: (playing: boolean) => void
  setSpeed: (speed: number) => void
  toggleBackground: () => void
  setCompareEnabled: (enabled: boolean) => void
  setCompareField: (field: string | null, component?: ComponentSelector) => void
  reset: () => void
}

export const useResultsStore = create<ResultsState>((set, get) => ({
  projectId: null,
  items: [],
  selectedId: null,
  timeIndex: 0,
  playing: false,
  speed: 2,
  background: 'dark',
  compareEnabled: false,
  compareField: null,
  compareComponent: VECTOR_MAGNITUDE,

  initPipeline: (projectId, fields, patchNames) => {
    if (get().projectId === projectId && get().items.length > 0) return
    // Default coloring: U magnitude when present (the field engineers look at
    // first), otherwise the first available field.
    const defaultField = fields.find((f) => f.name === 'U') ?? fields[0] ?? null
    const mesh: PipelineItem = {
      id: 'mesh',
      type: 'mesh',
      label: 'Mesh',
      visible: true,
      field: defaultField?.name ?? null,
      component: VECTOR_MAGNITUDE,
      colormap: DEFAULT_COLORMAP,
      rangeMode: 'auto',
      manualRange: [0, 1],
      representation: 'surface',
      opacity: 1,
    }
    const patches: PipelineItem[] = patchNames.map((name) => ({
      id: `patch:${name}`,
      type: 'patch',
      label: name,
      visible: false,
      field: null,
      component: VECTOR_MAGNITUDE,
      colormap: DEFAULT_COLORMAP,
      rangeMode: 'auto',
      manualRange: [0, 1],
      representation: 'surface',
      opacity: 1,
      patchName: name,
    }))
    set({
      projectId,
      items: [mesh, ...patches],
      selectedId: 'mesh',
      timeIndex: 0,
      playing: false,
    })
  },

  addItem: (item) => set((s) => ({ items: [...s.items, item], selectedId: item.id })),

  removeItem: (id) =>
    set((s) => ({
      items: s.items.filter((i) => i.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  updateItem: (id, patch) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    })),

  select: (id) => set({ selectedId: id }),
  setTimeIndex: (index) => set({ timeIndex: index }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  toggleBackground: () => set((s) => ({ background: s.background === 'dark' ? 'light' : 'dark' })),
  setCompareEnabled: (compareEnabled) => set({ compareEnabled }),
  setCompareField: (compareField, component) =>
    set((s) => ({ compareField, compareComponent: component ?? s.compareComponent })),

  reset: () =>
    set({
      projectId: null,
      items: [],
      selectedId: null,
      timeIndex: 0,
      playing: false,
    }),
}))
