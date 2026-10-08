import { spawn, spawnSync } from 'child_process'

export type AllowedHostCommandId =
  | 'start_docker_desktop_darwin'
  | 'start_docker_service_linux'
  | 'start_docker_desktop_windows'
  | 'pull_openfoam_source_image'
  | 'install_codex_cli'

export interface AllowedHostCommand {
  id: AllowedHostCommandId
  label: string
  command: string
  args: string[]
}

export interface HostCommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

const ALLOWED_HOST_COMMANDS: Record<AllowedHostCommandId, AllowedHostCommand> = {
  start_docker_desktop_darwin: {
    id: 'start_docker_desktop_darwin',
    label: 'Start Docker Desktop',
    command: 'open',
    args: ['-a', 'Docker'],
  },
  start_docker_service_linux: {
    id: 'start_docker_service_linux',
    label: 'Start docker.service',
    command: 'systemctl',
    args: ['start', 'docker'],
  },
  start_docker_desktop_windows: {
    id: 'start_docker_desktop_windows',
    label: 'Start Docker Desktop',
    command: 'powershell',
    args: ['-NoProfile', '-Command', 'Start-Process "Docker Desktop"'],
  },
  pull_openfoam_source_image: {
    id: 'pull_openfoam_source_image',
    label: 'Pull OpenFOAM source image',
    command: 'docker',
    args: ['pull', 'microfluidica/openfoam:13'],
  },
  install_codex_cli: {
    id: 'install_codex_cli',
    label: 'Install Codex CLI',
    command: 'npm',
    args: ['install', '-g', '@openai/codex'],
  },
}

export function getAllowedHostCommand(id: AllowedHostCommandId): AllowedHostCommand {
  return ALLOWED_HOST_COMMANDS[id]
}

export function isCommandOnPath(command: string): boolean {
  const checker = process.platform === 'win32' ? 'where' : 'which'
  const result = spawnSync(checker, [command], {
    stdio: 'ignore',
    env: process.env,
  })
  return result.status === 0
}

export async function runAllowedHostCommand(
  id: AllowedHostCommandId,
  onLine?: (line: string) => void,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<HostCommandResult> {
  const spec = getAllowedHostCommand(id)

  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(new Error('Setup cancelled')); return }
    const proc = spawn(spec.command, spec.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })

    const cancel = () => { proc.kill('SIGKILL'); reject(new Error('Setup cancelled or timed out')) }
    const timer = setTimeout(cancel, options.timeoutMs ?? 15 * 60_000)
    options.signal?.addEventListener('abort', cancel, { once: true })
    const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', cancel) }
    let stdout = ''
    let stderr = ''
    let stdoutBuffer = ''
    let stderrBuffer = ''

    const flushLines = (chunk: string, buffer: string) => {
      const next = buffer + chunk
      const lines = next.split('\n')
      const remainder = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim()) onLine?.(line)
      }
      return remainder
    }

    proc.stdout.on('data', chunk => {
      const text = chunk.toString()
      stdout = (stdout + text).slice(-262_144)
      stdoutBuffer = flushLines(text, stdoutBuffer)
    })

    proc.stderr.on('data', chunk => {
      const text = chunk.toString()
      stderr = (stderr + text).slice(-262_144)
      stderrBuffer = flushLines(text, stderrBuffer)
    })

    proc.on('error', err => { cleanup(); reject(err) })
    proc.on('close', code => {
      cleanup()
      if (stdoutBuffer.trim()) onLine?.(stdoutBuffer)
      if (stderrBuffer.trim()) onLine?.(stderrBuffer)
      resolve({
        exitCode: code ?? -1,
        stdout,
        stderr,
      })
    })
  })
}
