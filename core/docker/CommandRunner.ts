import type Docker from 'dockerode'

// Override with e.g. OFS_OPENFOAM_IMAGE=openfoam-ubuntu24.04:latest — any image
// works as long as OpenFOAM 13 is sourced from /opt/openfoam13/etc/bashrc.
export const OPENFOAM_IMAGE = process.env.OFS_OPENFOAM_IMAGE ?? 'microfluidica/openfoam:13'
const OF_BASHRC = '/opt/openfoam13/etc/bashrc'

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
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export async function runDockerCommand(
  docker: Docker,
  options: RunDockerCommandOptions
): Promise<number> {
  const { command, args, caseDir, onLine, signal } = options

  if (!ALLOWED_DOCKER_COMMANDS.has(command)) {
    throw new Error(`Docker command is not allowlisted: ${command}`)
  }
  if (signal?.aborted) throw new Error('aborted before start')

  const container = await docker.createContainer({
    Image: OPENFOAM_IMAGE,
    Cmd: ['tail', '-f', '/dev/null'],
    // Use a Mount object instead of a "src:dst" Bind string: on Windows the
    // drive-letter colon in caseDir (C:\...) collides with the bind separator.
    HostConfig: { Mounts: [{ Type: 'bind', Source: caseDir, Target: '/cavity' }] },
  })
  await container.start()

  const onAbort = () => {
    // SIGKILL the whole container; the exec's stream ends and cleanup in
    // `finally` handles remove. Errors here mean it's already gone.
    container.kill().catch(() => {})
  }
  signal?.addEventListener('abort', onAbort, { once: true })

  try {
    const argString = args.map(shellEscape).join(' ')
    const shellCmd = `source ${OF_BASHRC} && ${command}${argString ? ` ${argString}` : ''}`
    const exec = await container.exec({
      Cmd: ['bash', '-c', shellCmd],
      WorkingDir: '/cavity',
      AttachStdout: true,
      AttachStderr: true,
    })
    const stream = await exec.start({ hijack: true, stdin: false })

    let buffer = ''
    const writeChunk = (chunk: Buffer) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim()) onLine?.(line)
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sink = (fn: (chunk: Buffer) => void) => ({ write: fn }) as any

    await new Promise<void>((resolve, reject) => {
      docker.modem.demuxStream(stream, sink(writeChunk), sink(writeChunk))
      stream.on('end', () => {
        if (buffer.trim()) onLine?.(buffer)
        resolve()
      })
      stream.on('error', reject)
    })

    // The stream can end a beat before the exec's ExitCode is finalised. Poll
    // inspect until the exec stops running so we never return a false -1.
    let info = await exec.inspect()
    for (let i = 0; i < 20 && info.Running; i++) {
      await new Promise((r) => setTimeout(r, 50))
      info = await exec.inspect()
    }
    return info.ExitCode ?? -1
  } finally {
    signal?.removeEventListener('abort', onAbort)
    try { await container.stop({ t: 5 }) } catch { /* already stopped */ }
    try { await container.remove() } catch { /* already removed */ }
  }
}
