/**
 * Stage 4 — Physics validation tests
 *
 * Prerequisites:
 *   - Docker must be running
 *   - tests/fixtures/generated/cavity/ must exist (run test:stage1 first)
 *
 * Runs the full cavity simulation and validates against Ghia et al. 1982.
 * Expected runtime: ~2 minutes (Docker + solver).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Dockerode from 'dockerode'
import * as fs from 'fs'
import * as path from 'path'
import {
  sampleCenterlineU,
  interpolateU,
  type VelocityPoint,
} from '../../core/postprocess/VelocitySampler.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IMAGE = 'microfluidica/openfoam:13'
const OF_BASHRC = '/opt/openfoam13/etc/bashrc'
const FIXTURES_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'generated', 'cavity')
const GHIA_PATH = path.join(process.cwd(), 'tests', 'fixtures', 'benchmarks', 'ghia1982.json')

// Cavity mesh params (matches blockMeshDict: 20×20×1, domain=0.1m)
const MESH_PARAMS = { nx: 20, ny: 20, domainSize: 0.1 }

// Absolute tolerance for Ghia comparison (15% of max lid velocity = 1 m/s)
const GHIA_TOLERANCE = 0.15

// ---------------------------------------------------------------------------
// Docker helpers (same pattern as Stages 0, 2, 3)
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
// Shared state
// ---------------------------------------------------------------------------

let container: Dockerode.Container | null = null
let solverLog = ''
let uFileContent = ''
let centerlinePoints: VelocityPoint[] = []

interface GhiaPoint { y: number; u: number }
let ghiaData: GhiaPoint[] = []

beforeAll(async () => {
  console.log('\n[Stage 4] Loading Ghia benchmark data...')
  const ghiaRaw = JSON.parse(fs.readFileSync(GHIA_PATH, 'utf-8')) as { data: GhiaPoint[] }
  ghiaData = ghiaRaw.data
  console.log(`[Stage 4] Loaded ${ghiaData.length} Ghia reference points`)

  console.log('[Stage 4] Verifying fixture files...')
  if (!fs.existsSync(FIXTURES_DIR)) {
    throw new Error(
      `Fixture directory not found: ${FIXTURES_DIR}\n` +
      `Run "npm run test:stage1" first.`
    )
  }

  // Mount fixtures, start container
  const bind = `${FIXTURES_DIR}:/case:ro`
  console.log('[Stage 4] Starting container...')
  container = await startFreshContainer([bind])
  console.log(`[Stage 4] Container: ${container.id.slice(0, 12)}`)

  // Copy to writable dir
  const copyResult = await execInContainer(container, ['bash', '-c', 'cp -r /case /root/cavity'])
  if (copyResult.exitCode !== 0) throw new Error(`Copy failed: ${copyResult.stdout}`)

  // Patch controlDict: endTime=2 (Re=100 converges well before t=2)
  // writeControl=timeStep with writeInterval=20 → writes every 0.1s
  console.log('[Stage 4] Patching controlDict: endTime=2...')
  const sedResult = await execInContainer(container, [
    'bash', '-c',
    `sed -i 's/endTime[[:space:]]*[0-9.]*/endTime         2/' /root/cavity/system/controlDict && echo "SED_OK"`,
  ])
  if (!sedResult.stdout.includes('SED_OK')) {
    console.warn('[Stage 4] Warning: sed patch may have failed:', sedResult.stdout)
  }

  // Run blockMesh
  console.log('[Stage 4] Running blockMesh...')
  const bmResult = await execInContainer(container, [
    'bash', '-c',
    `cd /root/cavity && source ${OF_BASHRC} && blockMesh > /root/bm.log 2>&1; echo "EXIT:$?"`,
  ])
  const bmExit = parseInt((bmResult.stdout.match(/EXIT:(\d+)/) ?? [, '-1'])[1] ?? '-1', 10)
  if (bmExit !== 0) {
    const bmLog = await execInContainer(container, ['cat', '/root/bm.log'])
    throw new Error(`blockMesh failed:\n${bmLog.stdout.slice(-500)}`)
  }
  console.log('[Stage 4] blockMesh OK.')

  // Run foamRun
  console.log('[Stage 4] Running foamRun to t=2 (may take ~30s)...')
  const frResult = await execInContainer(container, [
    'bash', '-c',
    `cd /root/cavity && source ${OF_BASHRC} && foamRun > /root/solver.log 2>&1; echo "EXIT:$?"`,
  ])
  const frExit = parseInt((frResult.stdout.match(/EXIT:(\d+)/) ?? [, '-1'])[1] ?? '-1', 10)
  console.log(`[Stage 4] foamRun exit code: ${frExit}`)

  const logResult = await execInContainer(container, ['cat', '/root/solver.log'])
  solverLog = logResult.stdout
  console.log('[Stage 4] Solver log (last 12 lines):')
  solverLog.split('\n').slice(-12).forEach(l => console.log(`  ${l}`))

  if (frExit !== 0) {
    throw new Error(`foamRun failed with exit ${frExit}. Check solver log above.`)
  }

  // Find the final timestep directory
  console.log('[Stage 4] Finding final timestep directory...')
  const lsResult = await execInContainer(container, [
    'bash', '-c',
    `ls -d /root/cavity/[0-9]* 2>/dev/null | sort -V | tail -1`,
  ])
  const finalDir = lsResult.stdout.trim()
  console.log(`[Stage 4] Final timestep dir: ${finalDir}`)

  // Read the U file
  console.log(`[Stage 4] Reading U field from ${finalDir}/U...`)
  const uResult = await execInContainer(container, ['cat', `${finalDir}/U`])
  uFileContent = uResult.stdout
  console.log(`[Stage 4] U file size: ${uFileContent.length} bytes`)

  // Sample centerline
  centerlinePoints = sampleCenterlineU(uFileContent, MESH_PARAMS)
  console.log(`[Stage 4] Centerline sample: ${centerlinePoints.length} points`)
  console.log('[Stage 4] Centerline (y_norm, u):')
  centerlinePoints.forEach(p => console.log(`  y=${p.y.toFixed(4)}, u=${p.u.toFixed(5)}`))
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

describe('Stage 4 — Physics Validation', () => {

  // -------------------------------------------------------------------------
  it('Test 1: Simulation converges (final residuals < 1e-3)', () => {
    console.log('\n[Test 1] Checking convergence...')

    // Extract all residual values
    const residualRe = /Initial residual\s*=\s*([\d.eE+-]+)/g
    const allResiduals: number[] = []
    let m: RegExpExecArray | null
    while ((m = residualRe.exec(solverLog)) !== null) {
      allResiduals.push(parseFloat(m[1]!))
    }

    expect(allResiduals.length, 'Must have residual data in solver log').toBeGreaterThan(0)

    // Check residuals from the last 20 lines of residual data
    // (last 20 solver iterations worth)
    const last20 = allResiduals.slice(-20)
    const maxFinalResidual = Math.max(...last20)
    console.log(`  Total residual entries: ${allResiduals.length}`)
    console.log(`  Max residual in last 20 entries: ${maxFinalResidual}`)
    expect(
      maxFinalResidual,
      `Final residuals (${maxFinalResidual}) must be below 1e-3 — simulation must converge`
    ).toBeLessThan(1e-3)

    // Residuals should decrease over the run (first half average > second half average)
    const firstHalf = allResiduals.slice(0, Math.floor(allResiduals.length / 2))
    const secondHalf = allResiduals.slice(Math.floor(allResiduals.length / 2))
    const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length
    const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length
    console.log(`  First-half avg residual: ${firstAvg.toExponential(3)}`)
    console.log(`  Second-half avg residual: ${secondAvg.toExponential(3)}`)
    expect(
      secondAvg,
      'Residuals must decrease — second half avg must be below first half avg'
    ).toBeLessThan(firstAvg)

    console.log('[Test 1] PASS — simulation converged')
  })

  // -------------------------------------------------------------------------
  it('Test 2: Centerline velocity matches Ghia et al. 1982 within 15%', () => {
    console.log('\n[Test 2] Comparing against Ghia benchmark...')
    expect(centerlinePoints.length, 'Centerline must have data').toBeGreaterThan(0)

    // Skip boundary points (y=0 and y=1) from Ghia since cell centres
    // don't reach the walls — interpolation there is unreliable
    const interiorPoints = ghiaData.filter(p => p.y > 0.02 && p.y < 0.98)

    let maxDeviation = 0
    let worstPoint: { y: number; ghia: number; sim: number } | null = null

    for (const ref of interiorPoints) {
      const uSim = interpolateU(centerlinePoints, ref.y)
      const deviation = Math.abs(uSim - ref.u)
      console.log(
        `  y=${ref.y.toFixed(4)}: Ghia=${ref.u.toFixed(5)}, sim=${uSim.toFixed(5)}, |dev|=${deviation.toFixed(5)}`
      )
      if (deviation > maxDeviation) {
        maxDeviation = deviation
        worstPoint = { y: ref.y, ghia: ref.u, sim: uSim }
      }
    }

    console.log(`  Max deviation: ${maxDeviation.toFixed(5)} (tolerance: ${GHIA_TOLERANCE})`)
    if (worstPoint) {
      console.log(
        `  Worst point: y=${worstPoint.y}, Ghia=${worstPoint.ghia.toFixed(5)}, sim=${worstPoint.sim.toFixed(5)}`
      )
    }

    expect(
      maxDeviation,
      `Max deviation (${maxDeviation.toFixed(4)}) must be within ${GHIA_TOLERANCE} (absolute) of Ghia reference`
    ).toBeLessThan(GHIA_TOLERANCE)

    console.log('[Test 2] PASS — velocity profile matches Ghia benchmark')
  })

  // -------------------------------------------------------------------------
  it('Test 3: Physical features are present (lid velocity, no-slip, vortex)', () => {
    console.log('\n[Test 3] Checking physical features...')
    expect(centerlinePoints.length, 'Centerline must have data').toBeGreaterThan(0)

    // Top wall cell (highest y): u should be close to 1 m/s (lid velocity)
    const topCell = centerlinePoints[centerlinePoints.length - 1]!
    console.log(`  Top cell: y=${topCell.y.toFixed(4)}, u=${topCell.u.toFixed(5)}`)
    expect(
      topCell.u,
      `Top cell u (${topCell.u.toFixed(4)}) should be positive (near lid)`
    ).toBeGreaterThan(0)

    // Bottom wall cell (lowest y): u should be close to 0 (no-slip)
    const bottomCell = centerlinePoints[0]!
    console.log(`  Bottom cell: y=${bottomCell.y.toFixed(4)}, u=${bottomCell.u.toFixed(5)}`)
    expect(
      Math.abs(bottomCell.u),
      `Bottom cell |u| (${bottomCell.u.toFixed(4)}) should be < 0.3 (near no-slip wall)`
    ).toBeLessThan(0.3)

    // Vortex signature: u must change sign somewhere between y=0 and y=1
    // Ghia shows u goes negative (downward on centerline) in the lower half
    const hasNegativeU = centerlinePoints.some(p => p.u < 0)
    const hasPositiveU = centerlinePoints.some(p => p.u > 0)
    console.log(`  Has negative u: ${hasNegativeU}`)
    console.log(`  Has positive u: ${hasPositiveU}`)
    expect(hasNegativeU, 'u must be negative somewhere (vortex recirculation)').toBe(true)
    expect(hasPositiveU, 'u must be positive somewhere (lid-driven flow)').toBe(true)

    // Sign change count: there should be at least 1 sign change (vortex)
    let signChanges = 0
    for (let i = 1; i < centerlinePoints.length; i++) {
      const prev = centerlinePoints[i - 1]!.u
      const curr = centerlinePoints[i]!.u
      if (prev * curr < 0) signChanges++
    }
    console.log(`  Sign changes along centerline: ${signChanges}`)
    expect(signChanges, 'At least 1 sign change in u (vortex structure)').toBeGreaterThanOrEqual(1)

    console.log('[Test 3] PASS — physical features present')
  })

})
