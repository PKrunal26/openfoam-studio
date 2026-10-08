/**
 * Health checks for OpenFOAM Studio prerequisites.
 *
 * Exported as a pure function that takes a Dockerode instance so it is
 * fully testable without a running HTTP server.
 *
 * Four checks (run sequentially — image check skipped if Docker is down):
 *   1. docker    — Docker daemon is reachable
 *   2. image     — microfluidica/openfoam:13 image is present
 *   3. selected CLI is installed (optional for API providers)
 *   4. selected provider is configured
 */

import type Docker from 'dockerode'
import {
  getAllowedHostCommand,
  runAllowedHostCommand,
  type AllowedHostCommandId,
  type HostCommandResult,
} from './setup/HostCommandRunner.js'
import { resolveCodexBin } from './agent/codex-runner.js'
import { resolveClaudeBin } from './agent/claude-runner.js'
import { hasLLMAuth, getActiveProvider, readConfig, type AppConfig } from './setup/appConfig.js'
import { checkCodexAuthentication, checkClaudeAuthentication } from './setup/providerConnection.js'
import { OPENFOAM_IMAGE } from './docker/CommandRunner.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HealthCheckName = 'docker' | 'image' | 'codex_cli' | 'codex_auth' | 'claude_cli' | 'claude_auth'

export interface HealthCheck {
  name: HealthCheckName
  label: string
  pass: boolean
  fix: string
  /** Exact terminal commands, separate from human-readable guidance. */
  commands?: string[]
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
  hasCodexCli?: () => boolean
  hasClaudeCli?: () => boolean
  hasAuth?: () => boolean | Promise<boolean>
  config?: AppConfig
  /** Per-call ceiling for each Docker API round trip. See withTimeout below. */
  dockerTimeoutMs?: number
}

interface HealthRepairDeps {
  signal?: AbortSignal
  timeoutMs?: number
  platform?: NodeJS.Platform
  checkHealth?: () => Promise<HealthResult>
  runCommand?: (id: AllowedHostCommandId, onLine?: (line: string) => void, options?: { signal?: AbortSignal; timeoutMs?: number }) => Promise<HostCommandResult>
  waitForDocker?: () => Promise<boolean>
}

interface PlannedFixStep {
  check: HealthCheckName
  commandId: AllowedHostCommandId
}

const IMAGE_FILTERS = JSON.stringify({ reference: [OPENFOAM_IMAGE] })

/** Default ceiling for a single Docker API round trip during a health check. */
const DOCKER_PROBE_TIMEOUT_MS = 5_000

/**
 * Reject if `promise` has not settled within `ms`.
 *
 * Docker Desktop that is installed but still starting, a wedged daemon, or a
 * daemon listening on a socket this process cannot reach all leave dockerode
 * calls pending forever — there is no client-side timeout. Health checks must
 * report "Docker unreachable" instead of never answering, otherwise GET /health
 * hangs and the setup modal never gets a result to render.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`))
    }, ms)
    promise.then(
      value => { clearTimeout(timer); resolve(value) },
      err => { clearTimeout(timer); reject(err) },
    )
  })
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

export async function runHealthChecks(
  docker: Docker,
  deps: HealthRunnerDeps = {}
): Promise<HealthResult> {
  const checks: HealthCheck[] = []
  const hasClaudeCli = deps.hasClaudeCli ?? (() => resolveClaudeBin() !== null)
  const hasCodexCli = deps.hasCodexCli ?? (() => resolveCodexBin() !== null)
  const cfg = deps.config ?? readConfig()
  const hasAuth = deps.hasAuth ?? (() => getActiveProvider(cfg) === 'codex-cli' ? checkCodexAuthentication() : getActiveProvider(cfg) === 'claude-cli' ? checkClaudeAuthentication() : hasLLMAuth(cfg))
  const timeoutMs = deps.dockerTimeoutMs ?? DOCKER_PROBE_TIMEOUT_MS

  // ── Check 1: Docker daemon ─────────────────────────────────────────────────
  let dockerOk = false
  try {
    await withTimeout(Promise.resolve(docker.ping()), timeoutMs, 'docker.ping')
    dockerOk = true
  } catch {
    // daemon not reachable, or reachable but not answering in time
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
      const images = await withTimeout(
        Promise.resolve(docker.listImages({ filters: IMAGE_FILTERS })),
        timeoutMs,
        'docker.listImages',
      )
      imageOk = images.length > 0
    } catch {
      // unexpected error from the daemon, or no answer in time
    }
  }
  checks.push({
    name: 'image',
    label: 'OpenFOAM image',
    pass: imageOk,
    fix: `docker pull ${OPENFOAM_IMAGE}`,
    commands: [`docker pull ${OPENFOAM_IMAGE}`],
    canAutoFix: true,
  })

  // ── Check 3: Selected CLI — only required when the user picks a CLI provider.
  const activeProvider = getActiveProvider(cfg)
  const codex = activeProvider === 'codex-cli'
  const cliOk = codex ? hasCodexCli() : activeProvider !== 'claude-cli' || hasClaudeCli()
  checks.push({
    name: codex ? 'codex_cli' : 'claude_cli',
    label: codex ? 'Codex CLI' : activeProvider === 'claude-cli' ? 'Claude Code CLI' : 'Claude Code CLI (optional for API providers)',
    pass: cliOk,
    fix: codex ? 'Install Codex CLI, then sign in.' : 'Install Claude Code CLI, then sign in.',
    commands: codex ? ['npm install -g @openai/codex', 'codex login'] : ['npm install -g @anthropic-ai/claude-code', 'claude auth login'],
    canAutoFix: false,
  })

  // ── Check 4: Selected-provider configuration (connection is tested separately). ────
  const authOk = await hasAuth()
  checks.push({
    name: codex ? 'codex_auth' : 'claude_auth',
    label: 'AI provider configured',
    pass: authOk,
    fix: codex ? 'codex login' : activeProvider === 'claude-cli' ? 'claude auth login' : 'Pick an API provider in Settings and add its key.',
    commands: codex ? ['codex login'] : activeProvider === 'claude-cli' ? ['claude auth login'] : undefined,
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

  // CLI installation is optional and manual. Repairing Docker must not also
  // install a global npm package when the user may prefer an API provider.

  return steps
}

export async function waitForDockerReady(docker: Docker, timeoutMs = 45_000, signal?: AbortSignal): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs && !signal?.aborted) {
    try {
      await withTimeout(Promise.resolve(docker.ping()), Math.min(5_000, timeoutMs - (Date.now() - start)), 'docker.ping')
      return !signal?.aborted
    } catch {
      if (!signal?.aborted) await new Promise(resolve => setTimeout(resolve, Math.min(1_500, Math.max(0, timeoutMs - (Date.now() - start)))))
    }
  }
  return false
}

export async function repairHealthChecks(
  docker: Docker,
  deps: HealthRepairDeps = {}
): Promise<HealthFixResult> {
  const signal = AbortSignal.any([AbortSignal.timeout(deps.timeoutMs ?? 15 * 60_000), ...(deps.signal ? [deps.signal] : [])])
  const bounded = <T>(work: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const abort = () => reject(new Error('Setup cancelled or timed out'))
    if (signal.aborted) { abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
  const checkHealth = deps.checkHealth ?? (() => runHealthChecks(docker))
  const runCommand = deps.runCommand ?? runAllowedHostCommand
  const platform = deps.platform ?? process.platform
  const waitForDocker = deps.waitForDocker ?? (() => waitForDockerReady(docker, 45_000, signal))

  const before = await bounded(checkHealth())
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
    if (signal.aborted) throw new Error('Setup cancelled or timed out')
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
    const result = await bounded(runCommand(step.commandId, line => {
      output = (output + `${line}\n`).slice(-262_144)
    }, { signal }))

    let ok = result.exitCode === 0

    if (step.check === 'docker' && ok) {
      dockerReady = await bounded(waitForDocker())
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

  const after = await bounded(checkHealth())
  return { before, after, steps }
}

export { buildHealthFixPlan }
