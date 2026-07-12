/**
 * Stage 3 — Solver execution tests
 *
 * Prerequisites:
 *   - Docker must be running
 *   - tests/fixtures/generated/cavity/ must exist (run test:stage1 first)
 *
 * No API calls. Runs foamRun on Stage 1 generated files.
 * Expected runtime: ~3 minutes.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Dockerode from 'dockerode'
import * as fs from 'fs'
import * as path from 'path'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IMAGE = 'microfluidica/openfoam:13'
const OF_BASHRC = '/opt/openfoam13/etc/bashrc'
const FIXTURES_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'generated', 'cavity')

// ---------------------------------------------------------------------------
// Docker helpers (same pattern as Stage 0 and 2)
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

async function startFreshContainer(binds: string[] = []): Promise<Dockerode.Container> {
  const container = await docker.createContainer({
    Image: IMAGE,
    Cmd: ['tail', '-f', '/dev/null'],
    Tty: false,
    HostConfig: { Binds: binds },
  })
  await container.start()
  return container
}

async function cleanupContainer(container: Dockerode.Container): Promise<void> {
  try { await container.stop({ t: 5 }) } catch { /* already stopped */ }
  try { await container.remove() } catch { /* already removed */ }
}

// ---------------------------------------------------------------------------
// Shared state: one container, reused across all 3 tests
// ---------------------------------------------------------------------------

let container: Dockerode.Container | null = null
let solverLog = ''
let solverExitCode = -1

beforeAll(async () => {
  console.log('\n[Stage 3] Verifying fixture files exist...')

  if (!fs.existsSync(FIXTURES_DIR)) {
    throw new Error(
      `Fixture directory not found: ${FIXTURES_DIR}\n` +
      `Run "npm run test:stage1" first to generate the cavity case files.`
    )
  }
  console.log(`[Stage 3] Fixtures found in ${FIXTURES_DIR}`)

  // Mount fixtures read-only, start container
  const bind = `${FIXTURES_DIR}:/case:ro`
  console.log('[Stage 3] Starting container...')
  container = await startFreshContainer([bind])
  console.log(`[Stage 3] Container: ${container.id.slice(0, 12)}`)

  // Copy to writable working dir
  console.log('[Stage 3] Copying fixture files to writable case directory...')
  const copyResult = await execInContainer(container, [
    'bash', '-c', 'cp -r /case /root/cavity',
  ])
  if (copyResult.exitCode !== 0) {
    throw new Error(`Failed to copy case files: ${copyResult.stdout}`)
  }

  // Run blockMesh first
  console.log('[Stage 3] Running blockMesh...')
  const bmResult = await execInContainer(container, [
    'bash', '-c',
    `cd /root/cavity && source ${OF_BASHRC} && blockMesh > /dev/null 2>&1; echo "EXIT:$?"`,
  ])
  const bmExit = parseInt(
    (bmResult.stdout.match(/EXIT:(\d+)/) ?? [, '-1'])[1] ?? '-1', 10
  )
  if (bmExit !== 0) {
    throw new Error(`blockMesh failed with exit code ${bmExit}`)
  }
  console.log('[Stage 3] blockMesh OK.')

  // Run foamRun
  console.log('[Stage 3] Running foamRun (this may take ~2 minutes)...')
  const frResult = await execInContainer(container, [
    'bash', '-c',
    `cd /root/cavity && source ${OF_BASHRC} && foamRun > /root/solver.log 2>&1; echo "EXIT:$?"`,
  ])
  solverExitCode = parseInt(
    (frResult.stdout.match(/EXIT:(\d+)/) ?? [, '-1'])[1] ?? '-1', 10
  )
  const logResult = await execInContainer(container, ['cat', '/root/solver.log'])
  solverLog = logResult.stdout

  console.log(`[Stage 3] foamRun exit code: ${solverExitCode}`)
  console.log('[Stage 3] Solver log (last 15 lines):')
  solverLog.split('\n').slice(-15).forEach(l => console.log(`  ${l}`))
}, 240_000)

afterAll(async () => {
  if (container) {
    await cleanupContainer(container)
    container = null
  }
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Stage 3 — Solver Execution', () => {

  // -------------------------------------------------------------------------
  it('Test 1: foamRun starts and completes without error', () => {
    console.log('\n[Test 1] Asserting foamRun result...')
    expect(solverExitCode, 'foamRun should exit 0').toBe(0)
    expect(solverLog, 'Solver log must not contain FOAM FATAL ERROR').not.toContain('FOAM FATAL ERROR')

    const timeLines = (solverLog.match(/^Time = /mg) ?? []).length
    console.log(`  "Time =" count = ${timeLines}`)
    expect(timeLines, 'Solver must report at least 10 time steps').toBeGreaterThanOrEqual(10)

    console.log('[Test 1] PASS')
  })

  // -------------------------------------------------------------------------
  it('Test 2: Residuals are written and solver actually ran', () => {
    console.log('\n[Test 2] Checking residuals in solver log...')

    // Residual lines look like: "Solving for Ux, Initial residual = 0.xxx"
    const residualMatches = [
      ...solverLog.matchAll(/Initial residual\s*=\s*([\d.eE+-]+)/g)
    ]
    console.log(`  Residual entries found: ${residualMatches.length}`)
    expect(
      residualMatches.length,
      'Solver log must contain at least one residual entry'
    ).toBeGreaterThan(0)

    // At least one residual value must be < 1 (solver actually ran iterations)
    const residualValues = residualMatches.map(m => parseFloat(m[1]!))
    const minResidual = Math.min(...residualValues)
    console.log(`  Min initial residual seen: ${minResidual}`)
    expect(
      minResidual,
      `Min residual (${minResidual}) must be < 1 — solver must have actually run`
    ).toBeLessThan(1)

    console.log('[Test 2] PASS')
  })

  // -------------------------------------------------------------------------
  it('Test 3: Output timestep directories exist with U and p fields', async () => {
    console.log('\n[Test 3] Checking output timestep directories...')

    // List directories in /root/cavity that look like timesteps (numeric names, not "0")
    const lsResult = await execInContainer(container!, [
      'bash', '-c',
      `ls -d /root/cavity/[0-9]*.[0-9]* 2>/dev/null || ls -d /root/cavity/[1-9]* 2>/dev/null || echo "NONE"`,
    ])
    const dirs = lsResult.stdout.trim().split('\n').filter(d => d !== 'NONE' && d.trim() !== '')
    console.log(`  Timestep directories found: ${dirs.join(', ') || 'none'}`)

    expect(
      dirs.length,
      'At least one output timestep directory must exist after foamRun'
    ).toBeGreaterThan(0)

    // Check the last timestep has U and p
    const lastDir = dirs[dirs.length - 1]!.trim()
    console.log(`  Checking last timestep dir: ${lastDir}`)

    const checkU = await execInContainer(container!, ['test', '-f', `${lastDir}/U`])
    const checkP = await execInContainer(container!, ['test', '-f', `${lastDir}/p`])

    expect(checkU.exitCode, `U file must exist in ${lastDir}`).toBe(0)
    expect(checkP.exitCode, `p file must exist in ${lastDir}`).toBe(0)
    console.log(`  U and p exist in ${lastDir}`)

    console.log('[Test 3] PASS')
  })

})
