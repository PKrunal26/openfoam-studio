/**
 * Stage 0 — Environment validation tests
 *
 * Prerequisites: Docker must be running.
 * Image: microfluidica/openfoam:13  (OpenFOAM 13, Foundation)
 *
 * These tests verify the host environment before any application code is built.
 * They are intentionally slow (Docker pulls, solver runs). Never skip them.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import Dockerode from 'dockerode'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IMAGE = 'microfluidica/openfoam:13'
const OF_BASHRC = '/opt/openfoam13/etc/bashrc'
const CAVITY_SRC = '/opt/openfoam13/tutorials/incompressibleFluid/cavity'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const docker = new Dockerode()

/** Check image exists locally (no pull — it is already present). */
async function assertImageExists(image: string): Promise<void> {
  console.log(`  [image] Checking for image: ${image}`)
  const images = await docker.listImages({ filters: { reference: [image] } })
  if (images.length === 0) {
    throw new Error(
      `Image "${image}" not found locally. Run: docker pull ${image}`
    )
  }
  console.log(`  [image] Found: ${images[0]?.RepoTags?.[0]} (${images[0]?.Id?.slice(0, 12)})`)
}

/**
 * Run a shell command inside a running container.
 * Returns { exitCode, stdout } where stdout includes both stdout and stderr.
 */
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

/** Create and start a fresh container. Keeps it alive with tail -f /dev/null. */
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

/** Stop and remove container, ignoring errors if already gone. */
async function cleanupContainer(container: Dockerode.Container): Promise<void> {
  try { await container.stop({ t: 5 }) } catch { /* already stopped */ }
  try { await container.remove() } catch { /* already removed */ }
}

/**
 * Copy the cavity tutorial into /root/cavity, then patch controlDict so
 * endTime = 0.05 (10 steps at deltaT 0.005) for fast test runs.
 */
async function setupCavity(container: Dockerode.Container): Promise<void> {
  const cp = await execInContainer(container, ['bash', '-c', `cp -r ${CAVITY_SRC} /root/cavity`])
  if (cp.exitCode !== 0) throw new Error(`Failed to copy cavity: ${cp.stdout}`)

  // Reduce endTime so tests run in seconds, not minutes
  const patch = await execInContainer(container, [
    'bash', '-c',
    `sed -i 's/^endTime\\s.*;/endTime         0.05;/' /root/cavity/system/controlDict`,
  ])
  if (patch.exitCode !== 0) throw new Error(`Failed to patch controlDict: ${patch.stdout}`)
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

beforeAll(async () => {
  console.log('\n[Stage 0] Verifying Docker image is available...')
  await assertImageExists(IMAGE)
}, 10_000)

describe('Stage 0 — OpenFOAM Environment', () => {

  // -------------------------------------------------------------------------
  it('Test 1: Docker is running and image exists locally', async () => {
    console.log('\n[Test 1] Pinging Docker daemon...')
    const ping = await docker.ping()
    expect(String(ping)).toBe('OK')
    console.log('[Test 1] Docker daemon responded OK.')

    console.log('[Test 1] Checking image is present...')
    const images = await docker.listImages({ filters: { reference: [IMAGE] } })
    expect(images.length, `Image ${IMAGE} should exist locally`).toBeGreaterThan(0)
    console.log(`[Test 1] PASS — image: ${images[0]?.RepoTags?.[0]}`)
  }, 10_000)

  // -------------------------------------------------------------------------
  it('Test 2: Container starts and responds to a command', async () => {
    console.log('\n[Test 2] Starting container...')
    const container = await startFreshContainer()
    console.log(`[Test 2] Container: ${container.id.slice(0, 12)}`)

    try {
      const { exitCode, stdout } = await execInContainer(container, [
        'bash', '-c', 'echo "openfoam_ready"',
      ])
      console.log(`[Test 2] exit=${exitCode}  stdout="${stdout.trim()}"`)
      expect(exitCode).toBe(0)
      expect(stdout).toContain('openfoam_ready')
      console.log('[Test 2] PASS')
    } finally {
      await cleanupContainer(container)
    }
  }, 30_000)

  // -------------------------------------------------------------------------
  it('Test 3: blockMesh runs on cavity tutorial (exit 0, log contains "End")', async () => {
    console.log('\n[Test 3] Starting container...')
    const container = await startFreshContainer()
    console.log(`[Test 3] Container: ${container.id.slice(0, 12)}`)

    try {
      console.log('[Test 3] Copying cavity tutorial...')
      await setupCavity(container)

      console.log('[Test 3] Running blockMesh...')
      const { stdout } = await execInContainer(container, [
        'bash', '-c',
        `cd /root/cavity && source ${OF_BASHRC} && blockMesh > /root/cavity/blockMesh.log 2>&1; echo "EXIT:$?"`,
      ])

      const logResult = await execInContainer(container, ['cat', '/root/cavity/blockMesh.log'])
      console.log('[Test 3] blockMesh log (last 10 lines):')
      logResult.stdout.split('\n').slice(-10).forEach(l => console.log(`  ${l}`))

      const exitCode = parseInt((stdout.match(/EXIT:(\d+)/) ?? [, '-1'])[1] ?? '-1', 10)
      console.log(`[Test 3] blockMesh exit code: ${exitCode}`)

      expect(exitCode, 'blockMesh should exit 0').toBe(0)
      expect(logResult.stdout, 'blockMesh log should contain "End"').toContain('End')
      console.log('[Test 3] PASS')
    } finally {
      await cleanupContainer(container)
    }
  }, 120_000)

  // -------------------------------------------------------------------------
  it('Test 4: Solver runs 10 iterations without FOAM FATAL ERROR', async () => {
    console.log('\n[Test 4] Starting container...')
    const container = await startFreshContainer()
    console.log(`[Test 4] Container: ${container.id.slice(0, 12)}`)

    try {
      console.log('[Test 4] Copying cavity tutorial...')
      await setupCavity(container)

      console.log('[Test 4] Running blockMesh...')
      const bmResult = await execInContainer(container, [
        'bash', '-c',
        `cd /root/cavity && source ${OF_BASHRC} && blockMesh > /dev/null 2>&1; echo "EXIT:$?"`,
      ])
      const bmExit = parseInt((bmResult.stdout.match(/EXIT:(\d+)/) ?? [, '-1'])[1] ?? '-1', 10)
      expect(bmExit, 'blockMesh must succeed').toBe(0)
      console.log('[Test 4] blockMesh OK.')

      console.log('[Test 4] Running foamRun...')
      const { stdout } = await execInContainer(container, [
        'bash', '-c',
        `cd /root/cavity && source ${OF_BASHRC} && foamRun > /root/cavity/solver.log 2>&1; echo "EXIT:$?"`,
      ])

      const logResult = await execInContainer(container, ['cat', '/root/cavity/solver.log'])
      const log = logResult.stdout
      console.log('[Test 4] Solver log (last 15 lines):')
      log.split('\n').slice(-15).forEach(l => console.log(`  ${l}`))

      const exitCode = parseInt((stdout.match(/EXIT:(\d+)/) ?? [, '-1'])[1] ?? '-1', 10)
      const timeLines = (log.match(/^Time = /mg) ?? []).length
      console.log(`[Test 4] exit=${exitCode}  "Time =" count=${timeLines}`)

      expect(log, 'Solver log must not contain FOAM FATAL ERROR').not.toContain('FOAM FATAL ERROR')
      expect(timeLines, 'Solver should report at least 10 time steps').toBeGreaterThanOrEqual(10)
      console.log('[Test 4] PASS')
    } finally {
      await cleanupContainer(container)
    }
  }, 180_000)

  // -------------------------------------------------------------------------
  it('Test 5: Solver log is readable from host via volume mount', async () => {
    const hostTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'of-stage0-'))
    console.log(`\n[Test 5] Host temp dir: ${hostTmp}`)

    const container = await startFreshContainer([`${hostTmp}:/results`])
    console.log(`[Test 5] Container: ${container.id.slice(0, 12)}`)

    try {
      console.log('[Test 5] Setting up cavity...')
      await setupCavity(container)

      console.log('[Test 5] Running blockMesh...')
      const bmResult = await execInContainer(container, [
        'bash', '-c',
        `cd /root/cavity && source ${OF_BASHRC} && blockMesh > /dev/null 2>&1; echo "EXIT:$?"`,
      ])
      const bmExit = parseInt((bmResult.stdout.match(/EXIT:(\d+)/) ?? [, '-1'])[1] ?? '-1', 10)
      expect(bmExit, 'blockMesh must succeed').toBe(0)

      console.log('[Test 5] Running foamRun, writing log to /results/solver.log...')
      const { stdout } = await execInContainer(container, [
        'bash', '-c',
        `cd /root/cavity && source ${OF_BASHRC} && foamRun > /results/solver.log 2>&1; echo "EXIT:$?"`,
      ])
      const exitCode = parseInt((stdout.match(/EXIT:(\d+)/) ?? [, '-1'])[1] ?? '-1', 10)
      console.log(`[Test 5] Solver exit code: ${exitCode}`)

      // Read from HOST filesystem
      const logPath = path.join(hostTmp, 'solver.log')
      console.log(`[Test 5] Reading from host: ${logPath}`)
      expect(fs.existsSync(logPath), `${logPath} should exist on host`).toBe(true)

      const logContent = fs.readFileSync(logPath, 'utf-8')
      console.log(`[Test 5] Log size: ${logContent.length} bytes`)
      console.log('[Test 5] Log (last 10 lines):')
      logContent.split('\n').slice(-10).forEach(l => console.log(`  ${l}`))

      expect(logContent.length, 'Log file must not be empty').toBeGreaterThan(0)
      expect(logContent, 'Log must contain "Time =" entries').toContain('Time = ')
      console.log('[Test 5] PASS')
    } finally {
      await cleanupContainer(container)
      fs.rmSync(hostTmp, { recursive: true, force: true })
    }
  }, 180_000)

})
