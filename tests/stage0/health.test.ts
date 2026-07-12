/**
 * Stage 0 — Health check tests
 *
 * Tests runHealthChecks() directly (no HTTP server needed).
 * Runs against the real Docker daemon, same as other Stage 0 tests.
 */

import { describe, it, expect, afterEach } from 'vitest'
import Dockerode from 'dockerode'
import {
  buildHealthFixPlan,
  repairHealthChecks,
  runHealthChecks,
  type HealthResult,
} from '../../core/health.js'

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('runHealthChecks — happy path', () => {
  it('returns ok:true with all checks passing in a working environment', async () => {
    const docker = new Dockerode()
    const result = await runHealthChecks(docker)

    expect(result.checks).toHaveLength(4)
    expect(result.checks.find(c => c.name === 'docker')?.pass).toBe(true)
    expect(result.checks.find(c => c.name === 'image')?.pass).toBe(true)
    expect(result.checks.find(c => c.name === 'claude_cli')?.pass).toBe(true)
    expect(result.checks.find(c => c.name === 'claude_auth')?.pass).toBe(true)
    expect(result.ok).toBe(true)
  }, 10_000)

  it('responds in under 2 seconds', async () => {
    const docker = new Dockerode()
    const start = Date.now()
    await runHealthChecks(docker)
    expect(Date.now() - start).toBeLessThan(2000)
  }, 5_000)
})

// ---------------------------------------------------------------------------
// Docker-down path
// ---------------------------------------------------------------------------

describe('runHealthChecks — Docker unreachable', () => {
  it('marks docker and image as failing when daemon is not reachable', async () => {
    // Point at a connection that does not exist (cross-platform)
    const badDocker = process.platform === 'win32'
      ? new Dockerode({ host: '127.0.0.1', port: 1 })
      : new Dockerode({ socketPath: '/tmp/nonexistent-docker.sock' })
    const result = await runHealthChecks(badDocker)

    const dockerCheck = result.checks.find(c => c.name === 'docker')
    const imageCheck = result.checks.find(c => c.name === 'image')

    expect(dockerCheck?.pass).toBe(false)
    expect(imageCheck?.pass).toBe(false)   // skipped → false
    expect(result.ok).toBe(false)
  }, 5_000)

  it('still runs the claude_cli check even when Docker is down', async () => {
    const badDocker = process.platform === 'win32'
      ? new Dockerode({ host: '127.0.0.1', port: 1 })
      : new Dockerode({ socketPath: '/tmp/nonexistent-docker.sock' })
    const result = await runHealthChecks(badDocker)

    const claudeCheck = result.checks.find(c => c.name === 'claude_cli')
    expect(claudeCheck).toBeDefined()
    // claude is installed in the dev environment — this should still pass
    expect(claudeCheck?.pass).toBe(true)
  }, 5_000)
})

// ---------------------------------------------------------------------------
// Claude CLI missing
// ---------------------------------------------------------------------------

describe('runHealthChecks — Claude CLI not in PATH', () => {
  const originalPath = process.env.PATH

  afterEach(() => {
    // Always restore PATH — even if the test throws
    process.env.PATH = originalPath
  })

  it('marks claude_cli as failing when claude is not in PATH', async () => {
    process.env.PATH = ''
    const docker = new Dockerode()
    const result = await runHealthChecks(docker)

    const claudeCheck = result.checks.find(c => c.name === 'claude_cli')
    expect(claudeCheck?.pass).toBe(false)
    expect(claudeCheck?.fix).toContain('claude-code')
  }, 10_000)
})

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

describe('runHealthChecks — response shape', () => {
  it('every check has name, label, pass, and fix fields', async () => {
    const docker = new Dockerode()
    const result = await runHealthChecks(docker)

    for (const check of result.checks) {
      expect(typeof check.name).toBe('string')
      expect(typeof check.label).toBe('string')
      expect(typeof check.pass).toBe('boolean')
      expect(typeof check.fix).toBe('string')
      expect(typeof check.canAutoFix).toBe('boolean')
    }
  }, 10_000)

  it('check names are exactly: docker, image, claude_cli, claude_auth', async () => {
    const docker = new Dockerode()
    const result = await runHealthChecks(docker)
    const names = result.checks.map(c => c.name)
    expect(names).toEqual(['docker', 'image', 'claude_cli', 'claude_auth'])
  }, 10_000)
})

// ---------------------------------------------------------------------------
// Auto-fix planning + execution
// ---------------------------------------------------------------------------

describe('health auto-fix', () => {
  const failedResult: HealthResult = {
    ok: false,
    checks: [
      {
        name: 'docker',
        label: 'Docker daemon',
        pass: false,
        fix: 'Start Docker Desktop',
        canAutoFix: true,
      },
      {
        name: 'image',
        label: 'OpenFOAM image',
        pass: false,
        fix: 'docker pull microfluidica/openfoam:13',
        canAutoFix: true,
      },
      {
        name: 'claude_cli',
        label: 'Claude CLI',
        pass: false,
        fix: 'npm install -g @anthropic-ai/claude-code',
        canAutoFix: true,
      },
      {
        name: 'claude_auth',
        label: 'AI provider configured',
        pass: true,
        fix: 'Pick a provider and paste its API key in Settings, or run `claude login` to use the Claude Code CLI.',
        canAutoFix: false,
      },
    ],
  }

  const healthyResult: HealthResult = {
    ok: true,
    checks: failedResult.checks.map(check => ({ ...check, pass: true })),
  }

  it('builds a platform-aware repair plan', () => {
    const plan = buildHealthFixPlan(failedResult, 'darwin')
    expect(plan).toEqual([
      { check: 'docker', commandId: 'start_docker_desktop_darwin' },
      { check: 'image', commandId: 'pull_openfoam_source_image' },
      { check: 'claude_cli', commandId: 'install_claude_cli' },
    ])
  })

  it('runs repair commands in order and re-checks the environment', async () => {
    const commands: string[] = []
    let healthCallCount = 0
    const docker = new Dockerode({ socketPath: '/tmp/nonexistent-docker.sock' })

    const result = await repairHealthChecks(docker, {
      platform: 'darwin',
      checkHealth: async () => {
        healthCallCount += 1
        return healthCallCount === 1 ? failedResult : healthyResult
      },
      runCommand: async (commandId, onLine) => {
        commands.push(commandId)
        onLine?.(`ran ${commandId}`)
        return { exitCode: 0, stdout: '', stderr: '' }
      },
      waitForDocker: async () => true,
    })

    expect(commands).toEqual([
      'start_docker_desktop_darwin',
      'pull_openfoam_source_image',
      'install_claude_cli',
    ])
    expect(result.after.ok).toBe(true)
    expect(result.steps.every(step => step.ok)).toBe(true)
    expect(healthCallCount).toBe(2)
  })

  it('skips the image pull when Docker never comes up', async () => {
    const docker = new Dockerode({ socketPath: '/tmp/nonexistent-docker.sock' })

    const result = await repairHealthChecks(docker, {
      platform: 'linux',
      checkHealth: async () => failedResult,
      runCommand: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      waitForDocker: async () => false,
    })

    const imageStep = result.steps.find(step => step.check === 'image')
    expect(imageStep?.ok).toBe(false)
    expect(imageStep?.exitCode).toBeNull()
    expect(imageStep?.output).toContain('Skipped because Docker is still not reachable')
  })
})
