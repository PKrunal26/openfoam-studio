// RGB samples of a colormap for drawing HTML/CSS legends that match the
// viewport exactly. Uses the same vtk.js presets as ResultsEngine, so this is
// the one other module (besides the engine) that imports vtk.js color classes.

import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction'
import vtkColorMaps from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps'
import { colormapPreset } from './colormaps'

const cache = new Map<string, [number, number, number][]>()

/** `count` evenly spaced colors (0–255 per channel) from low to high. */
export function sampleColormap(id: string, count = 32): [number, number, number][] {
  const key = `${id}:${count}`
  const cached = cache.get(key)
  if (cached) return cached
  const ctf = vtkColorTransferFunction.newInstance()
  ctf.applyColorMap(vtkColorMaps.getPresetByName(colormapPreset(id)))
  ctf.setMappingRange(0, 1)
  ctf.updateRange()
  const out: [number, number, number][] = []
  const rgb = [0, 0, 0]
  for (let i = 0; i < count; i++) {
    ctf.getColor(count === 1 ? 0.5 : i / (count - 1), rgb)
    out.push([Math.round(rgb[0]! * 255), Math.round(rgb[1]! * 255), Math.round(rgb[2]! * 255)])
  }
  ctf.delete()
  cache.set(key, out)
  return out
}

/** CSS `linear-gradient(...)` for a legend bar. */
export function colormapGradient(id: string, direction = 'to right'): string {
  const stops = sampleColormap(id, 24).map(([r, g, b]) => `rgb(${r} ${g} ${b})`)
  return `linear-gradient(${direction}, ${stops.join(', ')})`
}
