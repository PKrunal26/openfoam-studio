/**
 * Whole-run field ranges, computed once on the server.
 *
 * The Results view colours every time step on one scale so frames can be
 * compared. Working that out in the browser means downloading every time step
 * of the run — tens of megabytes and one request per step, paid again by every
 * student who opens the same result. The server has the files on disk and the
 * result store is content-addressed, so it computes the table once per result
 * and ships it inside the VTK manifest instead.
 */
import { parseLegacyVtk } from '../../renderer/lib/vtk/legacyVtkParser.js'
import { computeRange, extractComponent, HIDDEN_FIELDS, VECTOR_MAGNITUDE, type ComponentSelector } from '../../renderer/lib/vtk/fieldStats.js'
import type { VtkSeries } from '../../core/postprocess/vtkSeries.js'

/** field name → component selector as a string → [min, max] across all steps. */
export type FieldRangeTable = Record<string, Record<string, [number, number]>>

/** Reads one VTK file as text. Injected so this stays testable without a store. */
export type StepReader = (relPath: string) => string | Promise<string>

/** The range a viewer should use for a field component, or null if unknown. */
export function rangeFromTable(
  table: FieldRangeTable,
  fieldName: string,
  component: ComponentSelector,
): [number, number] | null {
  return table[fieldName]?.[String(component)] ?? null
}

/** Scans every time step once and returns the range of each field component. */
export async function computeFieldRanges(series: VtkSeries, readStep: StepReader): Promise<FieldRangeTable> {
  const table: FieldRangeTable = {}
  const widen = (field: string, component: ComponentSelector, range: [number, number]): void => {
    const byComponent = (table[field] ??= {})
    const key = String(component)
    const current = byComponent[key]
    byComponent[key] = current
      ? [Math.min(current[0], range[0]), Math.max(current[1], range[1])]
      : range
  }

  for (const step of series.steps) {
    if (!step.internal) continue
    // One run can be tens of megabytes of ASCII. Hand the event loop back
    // between steps so this never stalls the class's other requests.
    await new Promise((resolve) => setImmediate(resolve))
    const dataset = parseLegacyVtk(await readStep(step.internal))
    for (const array of Object.values(dataset.pointData)) {
      if (HIDDEN_FIELDS.has(array.name)) continue
      const components: ComponentSelector[] = array.numComponents === 1
        ? [0]
        : [VECTOR_MAGNITUDE, 0, 1, 2].slice(0, array.numComponents + 1) as ComponentSelector[]
      for (const component of components) {
        widen(array.name, component, computeRange(extractComponent(array, component)))
      }
    }
  }
  return table
}
