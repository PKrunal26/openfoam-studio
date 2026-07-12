/**
 * buildRunCommands — the ordered Docker command pipeline for a case run.
 *
 * Extracted from handleRun so the sequencing (and the conditional setFields
 * step for VoF cases) is unit-testable without a server or Docker.
 *
 * The container always mounts the case at /cavity (see CommandRunner).
 */
import fs from 'fs'
import path from 'path'

// Standard CFD field set exported for the Results tab. foamToVTK silently
// skips fields a given case does not have, so over-listing is safe. alpha.water
// and p_rgh are included so VoF cases (dam break) render their interface.
export const VTK_EXPORT_FIELDS = '(U p p_rgh alpha.water k epsilon omega nut T)'

const CASE = '/cavity'

export interface RunCommand {
  cmd: string
  args: string[]
}

export function buildRunCommands(caseDir: string): RunCommand[] {
  const commands: RunCommand[] = [
    { cmd: 'blockMesh', args: ['-case', CASE] },
  ]

  // VoF / multiphase cases ship a setFieldsDict to initialise fields (e.g. the
  // dam-break water column). Without running setFields the solver starts from a
  // uniform field and the simulation is physically empty. Run it after meshing,
  // before the solver.
  if (fs.existsSync(path.join(caseDir, 'system', 'setFieldsDict'))) {
    commands.push({ cmd: 'setFields', args: ['-case', CASE] })
  }

  // Mesh-only export so the Geometry tab works even when the solver fails.
  commands.push({ cmd: 'foamToVTK', args: ['-case', CASE, '-ascii', '-useTimeName'] })

  commands.push({ cmd: 'foamRun', args: ['-case', CASE] })

  // Post-solve export of every written time step for the Results tab. Only
  // reached when foamRun exits 0 (the loop breaks on solver failure).
  commands.push({
    cmd: 'foamToVTK',
    args: ['-case', CASE, '-ascii', '-useTimeName', '-fields', VTK_EXPORT_FIELDS],
  })

  return commands
}
