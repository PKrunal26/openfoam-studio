/**
 * Health checks for OpenFOAM Studio prerequisites.
 *
 * Exported as a pure function that takes a Dockerode instance so it is
 * fully testable without a running HTTP server.
 *
 * Four checks (run sequentially — image check skipped if Docker is down):
 *   1. docker    — Docker daemon is reachable
 *   2. image     — microfluidica/openfoam:13 image is present
 *   3. claude_cli — `claude` binary is in PATH
 *   4. claude_auth — selected provider is configured
 */

import type Docker from 'dockerode'
import {
  getAllowedHostCommand,
  runAllowedHostCommand,
  type AllowedHostCommandId,
  type HostCommandResult,
} from './setup/HostCommandRunner.js'
import { resolveClaudeBin } from './agent/claude-runner.js'
import { hasApiKey, hasClaudeCredentials, getActiveProvider, readConfig } from './setup/appConfig.js'
import { OPENFOAM_IMAGE } from './docker/CommandRunner.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HealthCheckName = 'docker' | 'image' | 'claude_cli' | 'claude_auth'

export interface HealthCheck {
  name: HealthCheckName
  label: string
  pass: boolean
  fix: string
  canAutoFix: boolean
}

export interface HealthResult {
  ok: boolean
  checks: HealthCheck[]
}

export interface HealthFixStep {
  check: HealthCheckName
  label: string
  command: string
  exitCode: number | null
  ok: boolean
  output: string
}

export interface HealthFixResult {
  before: HealthResult
  after: HealthResult
  steps: HealthFixStep[]
}

interface HealthRunnerDeps {
  hasClaudeCli?: () => boolean
  hasAuth?: () => boolean
}

interface HealthRepairDeps {
  platform?: NodeJS.Platform
  checkHealth?: () => Promise<HealthResult>
  runCommand?: (id: AllowedHostCommandId, onLine?: (line: string) => void) => Promise<HostCommandResult>
  waitForDocker?: () => Promise<boolean>
}

interface PlannedFixStep {
  check: HealthCheckName
  commandId: AllowedHostCommandId
}

const IMAGE_FILTERS = JSON.stringify({ reference: [OPENFOAM_IMAGE] })

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

export async function runHealthChecks(
  docker: Docker,
  deps: HealthRunnerDeps = {}
): Promise<HealthResult> {
  const checks: HealthCheck[] = []
  const hasClaudeCli = deps.hasClaudeCli ?? (() => resolveClaudeBin() !== null)
  const hasAuth = deps.hasAuth ?? (() => hasApiKey() || hasClaudeCredentials())

  // ── Check 1: Docker daemon ─────────────────────────────────────────────────
  let dockerOk = false
  try {
    await docker.ping()
    dockerOk = true
  } catch {
    // daemon not reachable
  }
  checks.push({
    name: 'docker',
    label: 'Docker daemon',
    pass: dockerOk,
    fix: 'Start Docker Desktop, or on Linux: sudo systemctl start docker',
    canAutoFix: true,
  })

  // ── Check 2: OpenFOAM image ────────────────────────────────────────────────
  // Only attempt if Docker is reachable — otherwise listImages would also fail
  // and the user would see two confusing errors for one root cause.
  let imageOk = false
  if (dockerOk) {
    try {
      const images = await docker.listImages({
        filters: IMAGE_FILTERS,
      })
      imageOk = images.length > 0
    } catch {
      // unexpected error from the daemon
    }
  }
  checks.push({
    name: 'image',
    label: 'OpenFOAM image',
    pass: imageOk,
    fix: `Run: docker pull ${OPENFOAM_IMAGE}`,
    canAutoFix: true,
  })

  // ── Check 3: Claude CLI — only required when the user picks the CLI provider.
  const activeProvider = getActiveProvider(readConfig())
  const needsCli = activeProvider === 'claude-cli'
  const claudeOk = !needsCli || hasClaudeCli()
  checks.push({
    name: 'claude_cli',
    label: 'Claude CLI',
    pass: claudeOk,
    fix: 'Install Claude Code: npm install -g @anthropic-ai/claude-code  then run: claude login',
    canAutoFix: true,
  })

  // ── Check 4: LLM provider auth (BYOK — any configured provider counts). ────
  const authOk = hasAuth()
  checks.push({
    name: 'claude_auth',
    label: 'AI provider configured',
    pass: authOk,
    fix: 'Pick a provider and paste its API key in Settings, or run `claude login` to use the Claude Code CLI.',
    canAutoFix: false,
  })

  return {
    ok: checks.every(c => c.pass),
    checks,
  }
}

function formatCommand(commandId: AllowedHostCommandId): string {
  const spec = getAllowedHostCommand(commandId)
  return [spec.command, ...spec.args].join(' ')
}

function buildHealthFixPlan(result: HealthResult, platform: NodeJS.Platform): PlannedFixStep[] {
  const failed = new Set(result.checks.filter(check => !check.pass).map(check => check.name))
  const steps: PlannedFixStep[] = []

  if (failed.has('docker')) {
    if (platform === 'darwin') {
      steps.push({ check: 'docker', commandId: 'start_docker_desktop_darwin' })
    } else if (platform === 'linux') {
      steps.push({ check: 'docker', commandId: 'start_docker_service_linux' })
    } else if (platform === 'win32') {
      steps.push({ check: 'docker', commandId: 'start_docker_desktop_windows' })
    }
  }

  if (failed.has('image')) {
    steps.push({ check: 'image', commandId: 'pull_openfoam_source_image' })
  }

  if (failed.has('claude_cli')) {
    steps.push({ check: 'claude_cli', commandId: 'install_claude_cli' })
  }

  return steps
}

async function waitForDockerReady(docker: Docker, timeoutMs = 45_000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      await docker.ping()
      return true
    } catch {
      await new Promise(resolve => setTimeout(resolve, 1_500))
    }
  }
  return false
}

export async function repairHealthChecks(
  docker: Docker,
  deps: HealthRepairDeps = {}
): Promise<HealthFixResult> {
  const checkHealth = deps.checkHealth ?? (() => runHealthChecks(docker))
  const runCommand = deps.runCommand ?? runAllowedHostCommand
  const platform = deps.platform ?? process.platform
  const waitForDocker = deps.waitForDocker ?? (() => waitForDockerReady(docker))

  const before = await checkHealth()
  const plan = buildHealthFixPlan(before, platform)
  const steps: HealthFixStep[] = []

  if (before.ok || plan.length === 0) {
    return {
      before,
      after: before,
      steps,
    }
  }

  let dockerReady = before.checks.find(check => check.name === 'docker')?.pass ?? false

  for (const step of plan) {
    if (step.check === 'image' && !dockerReady) {
      steps.push({
        check: 'image',
        label: 'Prepare OpenFOAM image',
        command: formatCommand(step.commandId),
        exitCode: null,
        ok: false,
        output: 'Skipped because Docker is still not reachable.',
      })
      continue
    }

    let output = ''
    const result = await runCommand(step.commandId, line => {
      output += `${line}\n`
    })

    let ok = result.exitCode === 0

    if (step.check === 'docker' && ok) {
      dockerReady = await waitForDocker()
      ok = dockerReady
      if (!dockerReady) {
        output += 'Docker did not become reachable before the timeout.\n'
      }
    }

    if (!output.trim()) {
      output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    }

    steps.push({
      check: step.check,
      label: getAllowedHostCommand(step.commandId).label,
      command: formatCommand(step.commandId),
      exitCode: result.exitCode,
      ok,
      output: output.trim(),
    })
  }

  const after = await checkHealth()
  return { before, after, steps }
}

export { buildHealthFixPlan }
