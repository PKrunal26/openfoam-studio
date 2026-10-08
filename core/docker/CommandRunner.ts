import type Docker from 'dockerode'
import { randomUUID } from 'node:crypto'
import { assertCaseExecutionPolicy } from '../run/casePolicy.js'

// Override with e.g. OFS_OPENFOAM_IMAGE=openfoam-ubuntu24.04:latest — any image
// works as long as OpenFOAM 13 is sourced from /opt/openfoam13/etc/bashrc.
export const OPENFOAM_IMAGE = process.env['OFS_OPENFOAM_IMAGE'] ?? 'microfluidica/openfoam:13'
const OF_BASHRC = '/opt/openfoam13/etc/bashrc'

/** Install the configured image using Docker's API, with bounded progress and cancellation. */
export async function ensureOpenFoamImage(docker: Docker, options: {
  signal?: AbortSignal
  timeoutMs?: number
  onProgress?: (message: string) => void
} = {}): Promise<void> {
  const signal = AbortSignal.any([options.signal ?? new AbortController().signal,
    AbortSignal.timeout(options.timeoutMs ?? 20 * 60_000)])
  const bounded = <T>(operation: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    signal.throwIfAborted()
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
  signal.throwIfAborted()
  try { await bounded(docker.getImage(OPENFOAM_IMAGE).inspect()); return } catch (error) {
    if ((error as { statusCode?: number }).statusCode !== 404) throw error
  }
  await new Promise<void>((resolve, reject) => {
    let stream: NodeJS.ReadableStream & { destroy?: () => void } | undefined
    let settled = false
    const finish = (error?: unknown) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', abort)
      if (error) reject(error); else resolve()
    }
    const abort = () => { stream?.destroy?.(); finish(signal.reason) }
    signal.addEventListener('abort', abort, { once: true })
    docker.pull(OPENFOAM_IMAGE, (error: Error | null, result: NodeJS.ReadableStream) => {
      if (error) { finish(error); return }
      stream = result
      if (settled || signal.aborted) { stream.destroy?.(); abort(); return }
      let lastProgress = 0
      docker.modem.followProgress(result, (pullError: Error | null) => finish(pullError ?? undefined),
        (event: { status?: string; id?: string; progress?: string; error?: string }) => {
          if (event.error) { stream?.destroy?.(); finish(new Error(event.error)); return }
          if (Date.now() - lastProgress < 250) return
          lastProgress = Date.now()
          options.onProgress?.([event.id, event.status, event.progress].filter(Boolean).join(' ').slice(0, 512))
        })
    })
  })
  signal.throwIfAborted()
  await bounded(docker.getImage(OPENFOAM_IMAGE).inspect())
}

const ALLOWED_DOCKER_COMMANDS = new Set([
  'blockMesh',
  'checkMesh',
  'setFields',
  'foamRun',
  'foamToVTK',
  'icoFoam',
  'simpleFoam',
  'pimpleFoam',
])

export interface RunDockerCommandOptions {
  command: string
  args: string[]
  caseDir: string
  onLine?: (line: string) => void
  /** Abort kills the container, which ends the exec stream with a non-zero exit. */
  signal?: AbortSignal
  timeoutMs?: number
  jobId?: string
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** Restrict flags as well as executable names: -lib/-dict can bypass case policy. */
export function assertAllowedCommandArgs(command: string, args: string[]): void {
  if (!Array.isArray(args)) throw new Error('Invalid command arguments')
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '-case' && args[++index] === '/cavity') continue
    if (argument === '-noFunctionObjects') continue
    if (command === 'foamToVTK' && ['-ascii', '-useTimeName', '-latestTime', '-noZero'].includes(argument!)) continue
    if (command === 'foamToVTK' && argument === '-fields' && /^\([\w. ]+\)$/.test(args[++index] ?? '')) continue
    if (command === 'foamToVTK' && argument === '-time' && /^[\d.eE:+,-]+$/.test(args[++index] ?? '')) continue
    throw new Error(`Unsupported argument for ${command}: ${argument}`)
  }
}

export async function runDockerCommand(
  docker: Docker,
  options: RunDockerCommandOptions
): Promise<number> {
  const { command, args, caseDir, onLine } = options
  const signal = AbortSignal.any([options.signal ?? new AbortController().signal,
    AbortSignal.timeout(options.timeoutMs ?? 30 * 60_000)])
  const bounded = <T>(operation: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    signal.throwIfAborted()
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
  if (!ALLOWED_DOCKER_COMMANDS.has(command)) throw new Error(`Docker command is not allowlisted: ${command}`)
  assertAllowedCommandArgs(command, args)
  signal.throwIfAborted()
  assertCaseExecutionPolicy(caseDir)
  const pending = docker.createContainer({
    Image: OPENFOAM_IMAGE,
    Cmd: ['tail', '-f', '/dev/null'],
    Labels: { 'org.openfoam-studio.owned': 'true', 'org.openfoam-studio.instance': INSTANCE_ID,
      'org.openfoam-studio.job': options.jobId ?? randomUUID() },
    HostConfig: {
      Mounts: [{ Type: 'bind', Source: caseDir, Target: '/cavity' }],
      NetworkMode: 'none', ReadonlyRootfs: true, CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'], Memory: 2 * 1024 ** 3, NanoCpus: 2_000_000_000,
      PidsLimit: 256, Tmpfs: { '/tmp': 'rw,noexec,nosuid,size=256m' },
    },
  })
  // A late Docker create response must not leak a container after cancellation.
  void pending.then(container => { if (signal.aborted) void container.remove({ force: true }).catch(() => {}) }, () => {})
  const container = await bounded(pending)
  activeContainers.set(container.id, container)
  const onAbort = () => { void container.kill().catch(() => {}) }
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    signal.throwIfAborted()
    await bounded(container.start())
    if (signal.aborted) { onAbort(); signal.throwIfAborted() }
    const argString = args.map(shellEscape).join(' ')
    const shellCmd = `source ${OF_BASHRC} && ${command}${argString ? ` ${argString}` : ''}`
    const exec = await bounded(container.exec({
      Cmd: ['bash', '-c', shellCmd], WorkingDir: '/cavity', AttachStdout: true, AttachStderr: true,
    }))
    const stream = await bounded(exec.start({ hijack: true, stdin: false }))
    let buffer = ''
    const writeChunk = (chunk: Buffer) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = (lines.pop() ?? '').slice(-64 * 1024)
      for (const line of lines) if (line.trim()) onLine?.(line.slice(0, 64 * 1024))
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sink = (fn: (chunk: Buffer) => void) => ({ write: fn }) as any
    await bounded(new Promise<void>((resolve, reject) => {
      docker.modem.demuxStream(stream, sink(writeChunk), sink(writeChunk))
      stream.on('end', () => { if (buffer.trim()) onLine?.(buffer); resolve() })
      stream.on('error', reject)
    }))
    let info = await bounded(exec.inspect())
    for (let i = 0; i < 20 && info.Running; i++) {
      await bounded(new Promise(r => setTimeout(r, 50)))
      info = await bounded(exec.inspect())
    }
    signal.throwIfAborted()
    return info.ExitCode ?? -1
  } finally {
    signal.removeEventListener('abort', onAbort)
    // Cleanup uses a separate deadline because the job's signal may already be aborted.
    const cleanup = container.remove({ force: true }).catch(() => {})
    await Promise.race([cleanup, new Promise(resolve => { const timer = setTimeout(resolve, 5_000); timer.unref() })])
    activeContainers.delete(container.id)
  }
}

const INSTANCE_ID = randomUUID()
const activeContainers = new Map<string, Docker.Container>()

/** Shutdown hook: remove only containers owned by this running application instance. */
export async function cleanupOwnedContainers(): Promise<void> {
  await Promise.allSettled([...activeContainers.values()].map(container =>
    Promise.race([container.remove({ force: true }), new Promise(resolve => {
      const timer = setTimeout(resolve, 5_000); timer.unref()
    })])))
  activeContainers.clear()
}

/** checkMesh sometimes exits zero while reporting failed checks; logs are authoritative. */
export function meshCheckPassed(exitCode: number, log: string): boolean {
  return exitCode === 0 && /Mesh OK\./.test(log) && !/Failed\s+\d+\s+mesh checks|FOAM FATAL|illegal|negative volume/i.test(log)
}
