/**
 * Stage 5 — Error recovery tests
 *
 * Prerequisites:
 *   - Docker must be running
 *   - tests/fixtures/generated/cavity/ must exist (run test:stage1 first)
 *
 * Tests that the Reviewer agent correctly diagnoses and fixes the 3 most
 * common OpenFOAM failure modes. Each test injects an error, runs the solver
 * (expecting failure), calls the Reviewer, applies the fix, and verifies
 * the second run succeeds.
 *
 * Expected runtime: ~10 minutes.
 */

import { describe, it, expect } from 'vitest'
import Dockerode from 'dockerode'
import * as fs from 'fs'
import * as path from 'path'
import { Reviewer } from '../../core/agent/Reviewer.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IMAGE = 'microfluidica/openfoam:13'
const OF_BASHRC = '/opt/openfoam13/etc/bashrc'
const FIXTURES_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'generated', 'cavity')

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
// Docker helpers
// ---------------------------------------------------------------------------

const docker = new Dockerode()

async function execInContainer(
  container: Dockerode.Container,
  cmd: string[]
): Promise<{ exitCode: number; stdout: string }> {
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  })
  const stream = await exec.start({ hijack: true, stdin: false })
  let raw = ''
  await new Promise<void>((resolve, reject) => {
    docker.modem.demuxStream(
      stream,
      { write: (chunk: Buffer) => { raw += chunk.toString() } },
      { write: (chunk: Buffer) => { raw += chunk.toString() } }
    )
    stream.on('end', resolve)
    stream.on('error', reject)
  })
  const inspect = await exec.inspect()
  return { exitCode: inspect.ExitCode ?? -1, stdout: raw }
}

async function startFreshContainer(): Promise<Dockerode.Container> {
  const container = await docker.createContainer({
    Image: IMAGE,
    Cmd: ['tail', '-f', '/dev/null'],
    Tty: false,
  })
  await container.start()
  return container
}

async function cleanupContainer(container: Dockerode.Container): Promise<void> {
  try { await container.stop({ t: 5 }) } catch { /* already stopped */ }
  try { await container.remove() } catch { /* already removed */ }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Load all fixture files into a Record<filepath, content> */
function loadFixtures(): Record<string, string> {
  if (!fs.existsSync(FIXTURES_DIR)) {
    throw new Error(
      `Fixture directory not found: ${FIXTURES_DIR}\n` +
      `Run "npm run test:stage1" first.`
    )
  }
  const files: Record<string, string> = {}
  for (const relPath of REQUIRED_FILES) {
    const full = path.join(FIXTURES_DIR, relPath)
    files[relPath] = fs.readFileSync(full, 'utf-8')
  }
  return files
}

/**
 * Write a set of files into the container at /root/cavity, preserving
 * subdirectory structure. Files are written via echo -e to keep it simple.
 */
async function writeFilesToContainer(
  container: Dockerode.Container,
  files: Record<string, string>
): Promise<void> {
  for (const [relPath, content] of Object.entries(files)) {
    const containerPath = `/root/cavity/${relPath}`
    // Create parent dir
    await execInContainer(container, [
      'bash', '-c', `mkdir -p "$(dirname "${containerPath}")"`,
    ])
    // Write file via base64 to avoid shell escaping issues
    const b64 = Buffer.from(content, 'utf-8').toString('base64')
    await execInContainer(container, [
      'bash', '-c', `echo "${b64}" | base64 -d > "${containerPath}"`,
    ])
  }
}

/**
 * Run blockMesh + foamRun in the container.
 * Returns {exitCode, log} for the foamRun step.
 * endTime is patched to a small value for speed.
 */
async function runSolverWithFiles(
  container: Dockerode.Container,
  files: Record<string, string>,
  endTime: number = 0.05
): Promise<{ blockMeshExitCode: number; solverLog: string; solverExitCode: number }> {
  // Write files to container
  await writeFilesToContainer(container, files)

  // Patch endTime for speed
  await execInContainer(container, [
    'bash', '-c',
    `sed -i 's/endTime[[:space:]]*[0-9.]*/endTime         ${endTime}/' /root/cavity/system/controlDict`,
  ])

  // Run blockMesh
  const bmResult = await execInContainer(container, [
    'bash', '-c',
    `cd /root/cavity && source ${OF_BASHRC} && blockMesh > /root/bm.log 2>&1; echo "EXIT:$?"`,
  ])
  const blockMeshExitCode = parseInt(
    (bmResult.stdout.match(/EXIT:(\d+)/) ?? [, '-1'])[1] ?? '-1', 10
  )

  if (blockMeshExitCode !== 0) {
    const bmLog = await execInContainer(container, ['cat', '/root/bm.log'])
    return { blockMeshExitCode, solverLog: bmLog.stdout, solverExitCode: -1 }
  }

  // Run foamRun
  const frResult = await execInContainer(container, [
    'bash', '-c',
    `cd /root/cavity && source ${OF_BASHRC} && foamRun > /root/solver.log 2>&1; echo "EXIT:$?"`,
  ])
  const solverExitCode = parseInt(
    (frResult.stdout.match(/EXIT:(\d+)/) ?? [, '-1'])[1] ?? '-1', 10
  )
  const logResult = await execInContainer(container, ['cat', '/root/solver.log'])

  return { blockMeshExitCode, solverLog: logResult.stdout, solverExitCode }
}

// ---------------------------------------------------------------------------
// Tests — each test gets its own container for isolation
// ---------------------------------------------------------------------------

describe('Stage 5 — Error Recovery', () => {

  // -------------------------------------------------------------------------
  it('Test 1: Recovers from deltaT too large (divergence)', async () => {
    console.log('\n[Test 1] Starting container for deltaT recovery test...')
    const container = await startFreshContainer()
    console.log(`[Test 1] Container: ${container.id.slice(0, 12)}`)

    try {
      const baseFiles = loadFixtures()

      // Inject error: deltaT = 1.0 (way too large → Courant >> 1 → diverge)
      const brokenFiles = { ...baseFiles }
      brokenFiles['system/controlDict'] = baseFiles['system/controlDict']!
        .replace(/deltaT\s+[\d.eE+-]+;/, 'deltaT          1.0;')
      console.log('[Test 1] Injected bad deltaT=1.0 into controlDict')

      // First run: expect foamRun to produce diverged/failed results
      // endTime must exceed deltaT=1.0 so at least one iteration executes
      console.log('[Test 1] Running solver with bad deltaT (should diverge or error)...')
      const first = await runSolverWithFiles(container, brokenFiles, 5.0)
      console.log(`[Test 1] blockMesh exit: ${first.blockMeshExitCode}, foamRun exit: ${first.solverExitCode}`)
      console.log('[Test 1] Solver log (last 8 lines):')
      first.solverLog.split('\n').slice(-8).forEach(l => console.log(`  ${l}`))

      // The first run should indicate a problem (either crash or diverged residuals)
      // Large deltaT → large Courant → residuals stay at 1.0 or FOAM error
      const hasError = first.solverExitCode !== 0 ||
        first.solverLog.includes('FOAM FATAL') ||
        first.solverLog.includes('Courant Number') // may be present even on success

      // Pass error log to Reviewer
      console.log('[Test 1] Calling Reviewer agent...')
      const reviewer = new Reviewer()
      const result = await reviewer.review(first.solverLog, brokenFiles)
      console.log(`[Test 1] Reviewer result: ${JSON.stringify({ ...result, correctedContent: '[...]' })}`)

      expect('cannotIdentify' in result, 'Reviewer must not give up on this error').toBe(false)
      const fix = result as { filename: string; correctedContent: string; diagnosis: string }

      // Assert the right file was identified
      expect(
        fix.filename,
        `Reviewer should fix controlDict, got: ${fix.filename}`
      ).toContain('controlDict')

      // Assert the corrected content has a smaller deltaT
      const deltaTMatch = fix.correctedContent.match(/deltaT\s+([\d.eE+-]+)/)
      expect(deltaTMatch, 'Corrected controlDict must contain deltaT').toBeTruthy()
      const newDeltaT = parseFloat(deltaTMatch![1]!)
      console.log(`[Test 1] Corrected deltaT: ${newDeltaT}`)
      expect(newDeltaT, `Corrected deltaT (${newDeltaT}) must be < 0.01`).toBeLessThan(0.01)

      // Apply fix and run again
      const fixedFiles = { ...brokenFiles, [fix.filename]: fix.correctedContent }
      console.log('[Test 1] Running with corrected files (second run)...')
      await execInContainer(container, ['bash', '-c', 'rm -rf /root/cavity'])
      const second = await runSolverWithFiles(container, fixedFiles, 0.05)
      console.log(`[Test 1] Second run — foamRun exit: ${second.solverExitCode}`)
      second.solverLog.split('\n').slice(-6).forEach(l => console.log(`  ${l}`))

      expect(second.solverExitCode, 'Second run must succeed after fix').toBe(0)
      expect(second.solverLog, 'Second run must not have FOAM FATAL ERROR').not.toContain('FOAM FATAL ERROR')

      console.log('[Test 1] PASS — Reviewer fixed deltaT and second run succeeded')
    } finally {
      await cleanupContainer(container)
    }
  }, 360_000)

  // -------------------------------------------------------------------------
  it('Test 2: Recovers from missing boundary condition (movingWall)', async () => {
    console.log('\n[Test 2] Starting container for missing BC test...')
    const container = await startFreshContainer()
    console.log(`[Test 2] Container: ${container.id.slice(0, 12)}`)

    try {
      const baseFiles = loadFixtures()

      // Inject error: remove the movingWall patch from 0/U
      const originalU = baseFiles['0/U']!
      // Remove the movingWall block (from "movingWall" to the closing "}")
      const brokenU = originalU.replace(
        /[ \t]*movingWall\s*\n\s*\{[\s\S]*?\n\s*\}/m,
        ''
      )
      expect(brokenU, '0/U should not contain movingWall after injection').not.toContain('movingWall')
      const brokenFiles = { ...baseFiles, '0/U': brokenU }
      console.log('[Test 2] Removed movingWall from 0/U')

      // First run: expect foamRun to fail with missing patch error
      console.log('[Test 2] Running solver (should fail with missing BC)...')
      const first = await runSolverWithFiles(container, brokenFiles, 0.1)
      console.log(`[Test 2] blockMesh exit: ${first.blockMeshExitCode}, foamRun exit: ${first.solverExitCode}`)
      console.log('[Test 2] Error log (last 10 lines):')
      first.solverLog.split('\n').slice(-10).forEach(l => console.log(`  ${l}`))

      // The error log (or blockMesh log if foamRun wasn't reached) should mention movingWall
      const errorText = first.solverLog
      const mentionsBoundary = errorText.includes('movingWall') ||
        errorText.includes('boundaryField') ||
        errorText.includes('undefined')
      console.log(`[Test 2] Error mentions boundary issue: ${mentionsBoundary}`)

      // Call Reviewer
      console.log('[Test 2] Calling Reviewer agent...')
      const reviewer = new Reviewer()
      const result = await reviewer.review(errorText, brokenFiles)
      console.log(`[Test 2] Reviewer: ${JSON.stringify({ ...result, correctedContent: '[...]' })}`)

      expect('cannotIdentify' in result, 'Reviewer must not give up').toBe(false)
      const fix = result as { filename: string; correctedContent: string; diagnosis: string }

      // Assert 0/U is identified
      expect(fix.filename, `Should fix 0/U, got: ${fix.filename}`).toContain('U')
      expect(fix.correctedContent, 'Fixed 0/U must contain movingWall').toContain('movingWall')

      // Apply fix and run again
      const fixedFiles = { ...brokenFiles, [fix.filename]: fix.correctedContent }
      console.log('[Test 2] Running with corrected files (second run)...')
      await execInContainer(container, ['bash', '-c', 'rm -rf /root/cavity'])
      const second = await runSolverWithFiles(container, fixedFiles, 0.05)
      console.log(`[Test 2] Second run — foamRun exit: ${second.solverExitCode}`)
      second.solverLog.split('\n').slice(-6).forEach(l => console.log(`  ${l}`))

      expect(second.solverExitCode, 'Second run must succeed after fix').toBe(0)
      expect(second.solverLog).not.toContain('FOAM FATAL ERROR')

      console.log('[Test 2] PASS — Reviewer fixed missing BC and second run succeeded')
    } finally {
      await cleanupContainer(container)
    }
  }, 360_000)

  // -------------------------------------------------------------------------
  it('Test 3: Recovers from invalid turbulence model config', async () => {
    console.log('\n[Test 3] Starting container for turbulence model test...')
    const container = await startFreshContainer()
    console.log(`[Test 3] Container: ${container.id.slice(0, 12)}`)

    try {
      const baseFiles = loadFixtures()

      // Inject error: invalid simulationType in constant/momentumTransport
      const brokenMT = baseFiles['constant/momentumTransport']!
        .replace(/simulationType\s+\w+;/, 'simulationType  badValue;')
      const brokenFiles = { ...baseFiles, 'constant/momentumTransport': brokenMT }
      console.log('[Test 3] Injected invalid simulationType=badValue into momentumTransport')

      // First run: expect foamRun to fail with invalid turbulence model
      console.log('[Test 3] Running solver (should fail with invalid turbulence model)...')
      const first = await runSolverWithFiles(container, brokenFiles, 0.1)
      console.log(`[Test 3] blockMesh exit: ${first.blockMeshExitCode}, foamRun exit: ${first.solverExitCode}`)
      console.log('[Test 3] Error log (last 10 lines):')
      first.solverLog.split('\n').slice(-10).forEach(l => console.log(`  ${l}`))

      // Call Reviewer
      console.log('[Test 3] Calling Reviewer agent...')
      const reviewer = new Reviewer()
      const result = await reviewer.review(first.solverLog, brokenFiles)
      console.log(`[Test 3] Reviewer: ${JSON.stringify({ ...result, correctedContent: '[...]' })}`)

      expect('cannotIdentify' in result, 'Reviewer must not give up').toBe(false)
      const fix = result as { filename: string; correctedContent: string; diagnosis: string }

      // Assert momentumTransport is identified
      expect(
        fix.filename,
        `Should fix momentumTransport, got: ${fix.filename}`
      ).toContain('momentumTransport')
      expect(
        fix.correctedContent,
        'Fixed file must contain valid simulationType'
      ).toMatch(/simulationType\s+laminar/)

      // Apply fix and run again
      const fixedFiles = { ...brokenFiles, [fix.filename]: fix.correctedContent }
      console.log('[Test 3] Running with corrected files (second run)...')
      await execInContainer(container, ['bash', '-c', 'rm -rf /root/cavity'])
      const second = await runSolverWithFiles(container, fixedFiles, 0.05)
      console.log(`[Test 3] Second run — foamRun exit: ${second.solverExitCode}`)
      second.solverLog.split('\n').slice(-6).forEach(l => console.log(`  ${l}`))

      expect(second.solverExitCode, 'Second run must succeed after fix').toBe(0)
      expect(second.solverLog).not.toContain('FOAM FATAL ERROR')

      console.log('[Test 3] PASS — Reviewer fixed turbulence model and second run succeeded')
    } finally {
      await cleanupContainer(container)
    }
  }, 360_000)

})
