/**
 * Stage 1 — File generation tests
 *
 * No Docker. No OpenFOAM execution. Just LLM file generation + static validation.
 * Expected runtime: ~10 seconds (one API call, cached for subsequent tests).
 *
 * Prerequisites: the `claude` CLI must be installed and authenticated.
 *
 * TDD: These tests are written before the implementation.
 * They must fail with "cannot find module" until core/agent/FileGenerator.ts exists.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// This import will fail until Step 2 (implementation) is complete.
import { FileGenerator } from '../../core/agent/FileGenerator.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROMPT = 'simulate lid-driven cavity flow at Re=100'

// OF13 uses physicalProperties + momentumTransport (not the legacy names)
const REQUIRED_FILES = [
  '0/U',
  '0/p',
  'constant/physicalProperties',
  'constant/momentumTransport',
  'system/controlDict',
  'system/fvSchemes',
  'system/fvSolution',
  'system/blockMeshDict',
] as const

// ---------------------------------------------------------------------------
// Shared state: generate files once, reuse across all tests
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'generated', 'cavity')

let generatedFiles: Record<string, string> = {}

beforeAll(async () => {
  console.log(`\n[Stage 1] Generating files for prompt: "${PROMPT}"`)
  console.log('[Stage 1] Calling FileGenerator (one API call, ~5-10s)...')
  const generator = new FileGenerator()
  generatedFiles = await generator.generate(PROMPT)
  console.log(`[Stage 1] Got ${Object.keys(generatedFiles).length} files: ${Object.keys(generatedFiles).join(', ')}`)

  // Persist to disk so Stage 2 can reuse without another API call
  console.log(`[Stage 1] Saving fixtures to ${FIXTURES_DIR}...`)
  for (const [relPath, content] of Object.entries(generatedFiles)) {
    const full = path.join(FIXTURES_DIR, relPath)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content, { encoding: 'utf8' })
  }
  console.log(`[Stage 1] Fixtures written to ${FIXTURES_DIR}`)
}, 300_000)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Stage 1 — File Generation', () => {

  // -------------------------------------------------------------------------
  it('Test 1: All 8 required OpenFOAM files are present', () => {
    console.log('\n[Test 1] Checking all required files are in output...')

    for (const filePath of REQUIRED_FILES) {
      const normalised = filePath.replace(/\\/g, '/')
      const exists = Object.keys(generatedFiles).some(
        k => k.replace(/\\/g, '/') === normalised
      )
      console.log(`  ${exists ? '✓' : '✗'} ${filePath}`)
      expect(exists, `Missing required file: ${filePath}`).toBe(true)
    }

    console.log('[Test 1] PASS — all 8 files present')
  })

  // -------------------------------------------------------------------------
  it('Test 2: Every file has valid OpenFOAM syntax', () => {
    console.log('\n[Test 2] Validating OpenFOAM syntax in each file...')

    for (const filePath of REQUIRED_FILES) {
      const normalised = filePath.replace(/\\/g, '/')
      const content = Object.entries(generatedFiles).find(
        ([k]) => k.replace(/\\/g, '/') === normalised
      )?.[1] ?? ''

      console.log(`  Checking: ${filePath} (${content.length} bytes)`)

      // Must not be empty
      expect(content.trim().length, `${filePath} must not be empty`).toBeGreaterThan(0)

      // Must use LF line endings (no bare \r)
      expect(content.includes('\r'), `${filePath} must use LF line endings, not CRLF`).toBe(false)

      // Must contain a FoamFile header block
      expect(
        content.includes('FoamFile'),
        `${filePath} must contain a FoamFile header block`
      ).toBe(true)

      // Braces must be balanced
      const openBraces = (content.match(/\{/g) ?? []).length
      const closeBraces = (content.match(/\}/g) ?? []).length
      expect(
        openBraces,
        `${filePath}: unbalanced braces — ${openBraces} '{' vs ${closeBraces} '}'`
      ).toBe(closeBraces)

      // File must end with '}', ';', or '/' (OpenFOAM files close with // *** //)
      const trimmed = content.trimEnd()
      const lastChar = trimmed[trimmed.length - 1]
      expect(
        lastChar === '}' || lastChar === ';' || lastChar === '/',
        `${filePath}: must end with '}', ';', or '/' (OF footer), got '${lastChar}'`
      ).toBe(true)

      console.log(`    ✓ ${filePath}: ${openBraces} braces, ends with '${lastChar}'`)
    }

    console.log('[Test 2] PASS — all files have valid syntax')
  })

  // -------------------------------------------------------------------------
  it('Test 3: Physical values are within reasonable bounds', () => {
    console.log('\n[Test 3] Checking physical parameter bounds...')

    // --- physicalProperties: nu ---
    // OF13 format: nu  0.001 [m^2/s];  (value before units)
    const transportContent = getFile('constant/physicalProperties')
    const nuMatch = transportContent.match(/\bnu\s+([\d.eE+-]+)/)
    expect(nuMatch, 'constant/physicalProperties must contain a nu value').toBeTruthy()
    const nu = parseFloat(nuMatch![1]!)
    console.log(`  nu = ${nu}`)
    // nu = U*L/Re = 1*0.1/100 = 0.001 for this case — allow [1e-7, 1e-2] to cover
    // everything from gas (1e-5) to viscous simulation fluids (1e-2)
    expect(nu, `nu=${nu} must be in physical range [1e-7, 1e-2]`).toBeGreaterThanOrEqual(1e-7)
    expect(nu, `nu=${nu} must be in physical range [1e-7, 1e-2]`).toBeLessThanOrEqual(1e-2)

    // --- controlDict: endTime ---
    const controlContent = getFile('system/controlDict')
    const endTimeMatch = controlContent.match(/\bendTime\s+([\d.eE+-]+)/)
    expect(endTimeMatch, 'system/controlDict must contain endTime').toBeTruthy()
    const endTime = parseFloat(endTimeMatch![1]!)
    console.log(`  endTime = ${endTime}`)
    expect(endTime, `endTime=${endTime} must be > 0`).toBeGreaterThan(0)

    // --- controlDict: deltaT ---
    const deltaTMatch = controlContent.match(/\bdeltaT\s+([\d.eE+-]+)/)
    expect(deltaTMatch, 'system/controlDict must contain deltaT').toBeTruthy()
    const deltaT = parseFloat(deltaTMatch![1]!)
    console.log(`  deltaT = ${deltaT}`)
    expect(deltaT, `deltaT=${deltaT} must be > 0`).toBeGreaterThan(0)
    expect(deltaT, `deltaT=${deltaT} must be < endTime=${endTime}`).toBeLessThan(endTime)

    // --- 0/U: inlet velocity magnitude ---
    const uContent = getFile('0/U')
    // Look for uniform (Ux Uy Uz) or a fixedValue with a non-zero vector
    const uVectorMatch = uContent.match(/uniform\s+\(\s*([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s*\)/)
    expect(uVectorMatch, '0/U must contain at least one uniform velocity vector').toBeTruthy()

    // Find the inlet / moving wall velocity (highest magnitude among all uniform vectors)
    const allVectors = [...uContent.matchAll(/uniform\s+\(\s*([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s*\)/g)]
    const magnitudes = allVectors.map(m => {
      const ux = parseFloat(m[1]!), uy = parseFloat(m[2]!), uz = parseFloat(m[3]!)
      return Math.sqrt(ux * ux + uy * uy + uz * uz)
    })
    const uInlet = Math.max(...magnitudes)
    console.log(`  U_inlet (max magnitude) = ${uInlet} m/s`)
    expect(uInlet, `U_inlet=${uInlet} must be between 0.01 and 100 m/s`).toBeGreaterThanOrEqual(0.01)
    expect(uInlet, `U_inlet=${uInlet} must be between 0.01 and 100 m/s`).toBeLessThanOrEqual(100)

    // --- 0/U: at least 3 boundary patches ---
    const patchMatches = uContent.match(/\b\w+\s*\n?\s*\{/g) ?? []
    // Count entries that look like boundary conditions (have 'type' keyword nearby)
    const typeCount = (uContent.match(/\btype\b/g) ?? []).length
    console.log(`  Boundary patch entries (type keyword count) = ${typeCount}`)
    expect(typeCount, '0/U must define at least 3 boundary patches').toBeGreaterThanOrEqual(3)

    console.log('[Test 3] PASS — all physical values in bounds')
  })

  // -------------------------------------------------------------------------
  it('Test 4: Re=100 is physically consistent (within 2× of target)', () => {
    console.log('\n[Test 4] Verifying Reynolds number consistency...')

    const L = 0.1 // cavity dimension, metres

    // nu from physicalProperties (OF13 format: nu  0.001 [m^2/s];)
    const transportContent = getFile('constant/physicalProperties')
    const nuMatch = transportContent.match(/\bnu\s+([\d.eE+-]+)/)
    const nu = parseFloat(nuMatch![1]!)

    // U_inlet from 0/U (max magnitude of all uniform velocity vectors)
    const uContent = getFile('0/U')
    const allVectors = [...uContent.matchAll(/uniform\s+\(\s*([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s*\)/g)]
    const uInlet = Math.max(...allVectors.map(m => {
      const ux = parseFloat(m[1]!), uy = parseFloat(m[2]!), uz = parseFloat(m[3]!)
      return Math.sqrt(ux * ux + uy * uy + uz * uz)
    }))

    const Re = (uInlet * L) / nu
    console.log(`  U_inlet = ${uInlet} m/s`)
    console.log(`  L       = ${L} m (cavity dimension, fixed)`)
    console.log(`  nu      = ${nu}`)
    console.log(`  Re      = U * L / nu = ${uInlet} * ${L} / ${nu} = ${Re.toFixed(1)}`)
    console.log(`  Target  = 100  |  Acceptable range: [50, 200]`)

    expect(Re, `Re=${Re.toFixed(1)} must be >= 50`).toBeGreaterThanOrEqual(50)
    expect(Re, `Re=${Re.toFixed(1)} must be <= 200`).toBeLessThanOrEqual(200)

    console.log(`[Test 4] PASS — Re = ${Re.toFixed(1)} is within [50, 200]`)
  })

})

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function getFile(filePath: string): string {
  const normalised = filePath.replace(/\\/g, '/')
  const entry = Object.entries(generatedFiles).find(
    ([k]) => k.replace(/\\/g, '/') === normalised
  )
  if (!entry) throw new Error(`File not found in generated output: ${filePath}`)
  return entry[1]
}
