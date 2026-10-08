/** Deterministic diagnosis uses real field/solver context; uncertain physics needs input. */
export interface FileFix {
  file: string
  description: string
  oldValue: string
  newValue: string
  /** Original content captured at diagnosis time; stale approvals are rejected. */
  expectedContent?: string | undefined
}
export interface DiagnosisResult {
  errorClass: string
  description: string
  fix: FileFix[]
  assumptions?: string[]
}
export function diagnose(log: string, files: Record<string, string> = {}): DiagnosisResult | null {
  const solution = files['system/fvSolution']
  const control = files['system/controlDict']
  if (/keyword UFinal is undefined in dictionary/.test(log)) {
    return { errorClass: 'missing-ufinal', description: 'The solver requires a final velocity solve entry. Review the proposed UFinal entry.',
      fix: solution && /\bU\s*\{/.test(solution) && !/\bUFinal\b/.test(solution) ? [{
        file: 'system/fvSolution', description: 'Reuse the U solver settings with relTol 0 for the final solve',
        oldValue: 'ADD_UFINAL', newValue: 'ADD_UFINAL', expectedContent: solution,
      }] : [] }
  }
  if (/cannot find file\s+"[^"]*constant\/phaseProperties"/.test(log)) {
    return { errorClass: 'missing-phaseproperties',
      description: 'The VoF phaseProperties dictionary is absent. Supply the intended phase names and surface tension; these physical inputs cannot be inferred from a startup error.',
      fix: [], assumptions: ['No water/air pairing or surface tension has been assumed.'] }
  }
  const bad = /Unknown patchField type\s+"?([\w]+)"?/.exec(log)
  if (bad) {
    const badType = bad[1]!
    const field = /for field\s+"?([\w.]+)"?/.exec(log)?.[1] ??
      /(?:file:|dictionary)\s+[^\n]*\/(?:0|[\d.]+)\/([\w.]+)/.exec(log)?.[1]
    const fieldFile = field ? `0/${field}` : undefined
    const content = fieldFile ? files[fieldFile] : undefined
    // A noSlip replacement is meaningful only for an identified velocity wall,
    // with exactly one offending entry. Do not mutate pressure/scalar/inlet fields.
    let wallPatch: string | undefined
    if (field === 'U' && content) {
      const patches = [...content.matchAll(/([\w.-]+)\s*\{([^{}]*)\}/g)]
      const candidates = patches.filter(match => new RegExp(`\\btype\\s+${badType}\\s*;`).test(match[2]!))
      if (candidates.length === 1) {
        const candidate = candidates[0]![1]!
        const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        if (new RegExp(`\\b${escaped}\\s*\\{[^{}]*\\btype\\s+wall\\s*;`).test(files['system/blockMeshDict'] ?? '')) wallPatch = candidate
      }
    }
    const entry = content ? new RegExp(`\\btype\\s+${badType}\\s*;`).exec(content)?.[0] : undefined
    return { errorClass: 'bad-boundary-condition',
      description: wallPatch ? `Unknown velocity boundary type on wall ${wallPatch}. The proposed noSlip condition assumes a stationary impermeable wall; approve only if that is intended.` :
        `Unknown boundary type ${badType}${field ? ` for ${field}` : ''}. Field and patch intent must be confirmed before choosing a boundary condition.`,
      fix: wallPatch && fieldFile && content && entry ? [{ file: fieldFile,
        description: `Use noSlip on identified stationary wall ${wallPatch}`, oldValue: entry, newValue: 'type noSlip;', expectedContent: content }] : [],
      ...(wallPatch ? { assumptions: [`${wallPatch} is a stationary impermeable wall (velocity is zero).`] } : {}) }
  }
  if (/No reference cell found/.test(log)) {
    const algorithms = solution ? [...solution.matchAll(/\b(PIMPLE|SIMPLE|PISO)\s*\{/g)] : []
    const algorithm = algorithms.length === 1 ? algorithms[0] : undefined
    const pressureField = /for field\s+(p_rgh|p)\b/.exec(log)?.[1] ?? 'p'
    return { errorClass: 'missing-pressure-reference',
      description: algorithm ? `The ${pressureField} field needs a gauge reference in the actual ${algorithm[1]} algorithm block. Review the zero-gauge reference.` : 'Pressure reference is missing. The active algorithm block must be identified before applying a reference.',
      fix: algorithm && solution && !/\bpRef(?:Cell|Value)\b/.test(solution) ? [{
        file: 'system/fvSolution', description: `Add cell 0 / zero gauge pressure to ${algorithm[1]}`,
        oldValue: algorithm[0], newValue: algorithm[0] + '\n    pRefCell 0;\n    pRefValue 0;', expectedContent: solution,
      }] : [], assumptions: ['Pressure reference fixes a gauge; it does not establish a physical inlet or outlet pressure.'] }
  }
  const courants = [...log.matchAll(/Courant Number mean:\s*[\d.eE+-]+\s+max:\s*([\d.eE+-]+)/g)]
  const max = Number(courants.at(-1)?.[1])
  if (Number.isFinite(max) && max > 1) {
    return { errorClass: 'high-courant-number', description: `The last reported maximum Courant number is ${max}. Halving deltaT reduces the step size; revalidation is required and this does not guarantee stability.`,
      fix: control && /\bdeltaT\s+[\d.eE+-]+\s*;/.test(control) ? [{ file: 'system/controlDict',
        description: 'Halve the actual positive deltaT and revalidate', oldValue: 'HALVE_DELTA_T', newValue: 'HALVE_DELTA_T', expectedContent: control }] : [] }
  }
  return null
}
