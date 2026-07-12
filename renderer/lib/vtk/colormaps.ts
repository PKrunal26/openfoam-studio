// Colormap catalog for the Results tab. Ids are stable (persisted in the
// store); presets are vtk.js ColorMaps preset names.

export interface ColormapOption {
  id: string
  label: string
  /** vtk.js vtkColorMaps preset name */
  preset: string
}

export const COLORMAPS: ColormapOption[] = [
  { id: 'coolwarm', label: 'Cool to Warm', preset: 'Cool to Warm' },
  { id: 'viridis', label: 'Viridis', preset: 'Viridis (matplotlib)' },
  { id: 'rainbow', label: 'Rainbow (Jet)', preset: 'jet' },
  { id: 'grayscale', label: 'Grayscale', preset: 'Grayscale' },
]

export type ColormapId = (typeof COLORMAPS)[number]['id']

export const DEFAULT_COLORMAP: ColormapId = 'coolwarm'

export function colormapPreset(id: string): string {
  return COLORMAPS.find((c) => c.id === id)?.preset ?? 'Cool to Warm'
}
