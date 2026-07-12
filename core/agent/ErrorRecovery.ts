/**
 * ErrorRecovery — diagnose known FOAM FATAL ERROR classes from solver logs.
 *
 * Pure functions only: no filesystem access, no Docker, fully unit-testable.
 * The apply-fix endpoint in server.ts handles actual file mutations.
 */

export interface FileFix {
  file: string
  description: string
  /** Exact string to find in the file (for string replacement) */
  oldValue: string
  /** Replacement string */
  newValue: string
}

export interface DiagnosisResult {
  errorClass: string
  description: string
  fix: FileFix[]
}

// ── Error patterns ─────────────────────────────────────────────────────────

const BAD_BC_RE = /Unknown patchField type "([^"]+)"/

const MISSING_PREF_RE = /No reference cell found/

const MISSING_UFINAL_RE = /keyword UFinal is undefined in dictionary/

// Matches lines like: Courant Number mean: 0.1 max: 2.47
const HIGH_COURANT_RE = /Courant Number mean:\s*[\d.]+\s+max:\s*([\d.]+)/

// incompressibleVoF (dam break) aborts at startup when constant/phaseProperties
// is absent: cannot find file "//cavity/constant/phaseProperties"
const MISSING_PHASEPROPS_RE = /cannot find file\s+"[^"]*constant\/phaseProperties"/

// Canonical OF13 incompressibleVoF phaseProperties (water/air). Pairs with the
// per-phase constant/physicalProperties.{water,air} files.
const PHASEPROPERTIES_CONTENT = `FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    location    "constant";
    object      phaseProperties;
}

phases          (water air);

sigma           0.07;
`

// ── diagnose ───────────────────────────────────────────────────────────────

/**
 * Inspect a solver log string and return a DiagnosisResult for the first
 * recognized error class, or null if no known pattern matches.
 *
 * Priority: missing UFinal → bad BC → missing pRef → high Courant
 */
export function diagnose(log: string): DiagnosisResult | null {
  // 1. Missing UFinal solver entry (PIMPLE requires it)
  if (MISSING_UFINAL_RE.test(log)) {
    return {
      errorClass: 'missing-ufinal',
      description: 'PIMPLE solver requires a UFinal entry in fvSolution/solvers. Adding UFinal block.',
      fix: [
        {
          file: 'system/fvSolution',
          description: 'Add UFinal { $U; relTol 0; } solver block',
          oldValue: 'ADD_UFINAL',
          newValue: 'ADD_UFINAL',
        },
      ],
    }
  }

  // 2. Missing phaseProperties (incompressibleVoF / VoF cases). Create the file.
  if (MISSING_PHASEPROPS_RE.test(log)) {
    return {
      errorClass: 'missing-phaseproperties',
      description:
        'The incompressibleVoF solver requires constant/phaseProperties, which is absent. Creating it with a water/air phase pair (sigma 0.07) consistent with the alpha.water field.',
      fix: [
        {
          file: 'constant/phaseProperties',
          description:
            'Create the missing phaseProperties dictionary (phases (water air); sigma 0.07;).',
          // Empty oldValue is the create-file convention handled by applyFixes.
          oldValue: '',
          newValue: PHASEPROPERTIES_CONTENT,
        },
      ],
    }
  }

  // 3. Bad boundary condition type
  const bcMatch = BAD_BC_RE.exec(log)
  if (bcMatch) {
    const badType = bcMatch[1]
    // For velocity walls the correct type is noSlip; for fixedValue walls it's fixedValue.
    // We replace whatever bad type appeared with noSlip as the safe default for U walls.
    const goodType = 'noSlip'
    return {
      errorClass: 'bad-boundary-condition',
      description: `Boundary condition type "${badType}" is not valid for this field. Replacing with "${goodType}".`,
      fix: [
        {
          file: '0/U',
          description: `Replace patchField type "${badType}" with "${goodType}"`,
          oldValue: `type            ${badType}`,
          newValue: `type            ${goodType}`,
        },
      ],
    }
  }

  // 4. Missing pressure reference
  if (MISSING_PREF_RE.test(log)) {
    return {
      errorClass: 'missing-pressure-reference',
      description:
        'The pressure field has no fixed reference value. Adding pRefCell/pRefValue to fvSolution SIMPLE block.',
      fix: [
        {
          file: 'system/fvSolution',
          description: 'Add pRefCell 0 and pRefValue 0 inside the SIMPLE solver block',
          // The apply-fix endpoint will insert these lines; oldValue targets the SIMPLE opening.
          oldValue: 'SIMPLE\n{',
          newValue: 'SIMPLE\n{\n    pRefCell        0;\n    pRefValue       0;',
        },
      ],
    }
  }

  // 5. High Courant number (max > 1)
  const courantMatch = HIGH_COURANT_RE.exec(log)
  if (courantMatch) {
    const maxCourant = parseFloat(courantMatch[1] ?? '0')
    if (maxCourant > 1) {
      return {
        errorClass: 'high-courant-number',
        description: `Courant number exceeded 1 (max: ${maxCourant}). The deltaT in controlDict needs to be halved.`,
        fix: [
          {
            file: 'system/controlDict',
            description: 'Halve deltaT to bring Courant number below 1',
            // apply-fix endpoint detects the HALVE_DELTA_T sentinel and reads the real value
            oldValue: 'HALVE_DELTA_T',
            newValue: 'HALVE_DELTA_T',
          },
        ],
      }
    }
  }

  return null
}
