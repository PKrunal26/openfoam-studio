import { spawn, execFileSync } from 'node:child_process'
import * as os from 'node:os'
import * as fs from 'node:fs'
import * as path from 'node:path'

export function resolveClaudeBin(): string | null {
  const executable = process.platform === 'win32' ? 'claude.exe' : 'claude'
  const candidates = [
    ...((process.env['PATH'] ?? '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, executable))),
    path.join(os.homedir(), '.local', 'bin', executable),
    path.join('/usr', 'local', 'bin', executable), path.join('/opt', 'homebrew', 'bin', executable),
    path.join(os.homedir(), '.npm-global', 'bin', executable), path.join(os.homedir(), '.bun', 'bin', executable),
  ]
  for (const candidate of candidates) {
    try { fs.accessSync(candidate, fs.constants.X_OK); if (fs.statSync(candidate).isFile()) return candidate } catch { /* next */ }
  }
  return null
}
export function findClaudeBin(): string {
  const binary = resolveClaudeBin()
  if (!binary) throw new Error('Claude CLI executable was not found. Install the native Claude CLI.')
  return binary
}

/** Verified against official CLI reference and local 2.1.251 help. Fail closed on older CLIs. */
export function restrictedCliArgs(binary: string, tools = ''): string[] {
  const version = execFileSync(binary, ['--version'], { encoding: 'utf8', timeout: 5_000, maxBuffer: 64 * 1024 })
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim())
  if (!match || Number(match[1]) !== 2 || Number(match[2]) !== 1 || Number(match[3]) < 248) {
    throw new Error('Claude CLI 2.1.248 or newer in the verified 2.1 series is required for restricted mode; no unrestricted fallback is allowed.')
  }
  const help = execFileSync(binary, ['--help'], { encoding: 'utf8', timeout: 5_000, maxBuffer: 128 * 1024 })
  for (const flag of ['--restricted', '--safe-mode', '--tools', '--strict-mcp-config', '--disable-slash-commands', '--setting-sources']) {
    if (!help.includes(flag)) throw new Error(`Claude CLI lacks required safety flag ${flag}`)
  }
  return ['--restricted', '--safe-mode', '--tools', tools, '--strict-mcp-config',
    '--mcp-config', '{"mcpServers":{}}', '--disallowedTools', 'mcp__*',
    '--disable-slash-commands', '--setting-sources', '', '--no-session-persistence',
    '--settings', '{"disableAllHooks":true}', '--permission-mode', 'dontAsk']
}

/** Do not inherit arbitrary CLI customization, endpoint, plugin, or execution variables. */
export function restrictedCliEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { FORCE_COLOR: '0' }
  for (const key of ['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT',
    'APPDATA', 'LOCALAPPDATA', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN']) {
    if (process.env[key] !== undefined) env[key] = process.env[key]
  }
  return env
}

/**
 * Run `claude -p` with a system prompt.
 *
 * When `onText` is provided, uses `--output-format stream-json` and calls
 * `onText` with each new text delta as Claude generates output.
 * Returns the full result string (same shape as the non-streaming path).
 */
export function runClaude(
  systemPrompt: string,
  userPrompt: string,
  onText?: (delta: string) => void,
  model?: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<string> {
  const signal = AbortSignal.any([options.signal ?? new AbortController().signal, AbortSignal.timeout(options.timeoutMs ?? 120_000)])
  signal.throwIfAborted()
  const claudeBin = findClaudeBin()
  const safetyArgs = restrictedCliArgs(claudeBin)
  return new Promise((resolve, reject) => {
    const streaming = !!onText
    const args = [
      '-p',
      '--output-format', streaming ? 'stream-json' : 'json',
      ...(streaming ? ['--verbose'] : []),
      ...(model ? ['--model', model] : []),
      ...safetyArgs,
      '--system-prompt', systemPrompt,
    ]

    const proc = spawn(claudeBin, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      cwd: os.tmpdir(),
      env: restrictedCliEnv(),
    })
    let killTimer: NodeJS.Timeout | undefined
    const abort = () => { proc.kill('SIGTERM'); killTimer = setTimeout(() => proc.kill('SIGKILL'), 1_000); killTimer.unref() }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    let stdout = ''
    let stderr = ''
    let lineBuf = ''
    let seenTextLen = 0   // track how much text we've already forwarded

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdout += text
      if (stdout.length > 8 * 1024 * 1024) { abort(); reject(new Error('Claude CLI output limit exceeded')); return }

      if (!streaming) return

      // Parse stream-json events line by line
      lineBuf += text
      const lines = lineBuf.split('\n')
      lineBuf = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const ev = JSON.parse(trimmed)

          // Assistant events carry the accumulated text so far.
          // Send only the new portion (delta) since the last callback.
          if (ev.type === 'assistant' && Array.isArray(ev.message?.content)) {
            for (const block of ev.message.content) {
              if (block.type === 'text' && typeof block.text === 'string') {
                const full = block.text as string
                const delta = full.slice(seenTextLen)
                if (delta) {
                  onText!(delta)
                  seenTextLen = full.length
                }
              }
            }
          }
        } catch { /* partial or non-JSON line — skip */ }
      }
    })

    proc.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-64 * 1024) })

    proc.on('error', (err) => {
      signal.removeEventListener('abort', abort)
      if (killTimer) clearTimeout(killTimer)
      reject(new Error(`Failed to spawn claude CLI: ${err.message}. Is claude installed?`))
    })

    proc.on('close', (code) => {
      signal.removeEventListener('abort', abort)
      if (killTimer) clearTimeout(killTimer)
      if (signal.aborted) { reject(signal.reason); return }
      if (code !== 0) {
        reject(new Error(`claude exited with code ${code}. stderr: ${stderr} stdout: ${stdout}`))
        return
      }

      if (!streaming) {
        resolve(stdout)
        return
      }

      // Extract the result event from the last lines of the stream
      const lines = stdout.trim().split('\n')
      for (let i = lines.length - 1; i >= 0; i--) {
        const trimmed = lines[i]?.trim()
        if (!trimmed) continue
        try {
          const ev = JSON.parse(trimmed)
          if (ev.type === 'result') {
            // Re-shape to match what FileGenerator expects from `json` format
            resolve(JSON.stringify({
              type: 'result',
              subtype: ev.subtype ?? 'success',
              is_error: ev.is_error ?? (ev.subtype !== 'success'),
              result: ev.result ?? '',
            }))
            return
          }
        } catch { /* skip non-JSON lines */ }
      }

      // Fallback: hand back raw stdout and let FileGenerator handle the parse error
      resolve(stdout)
    })

    proc.stdin.write(userPrompt, 'utf8')
    proc.stdin.end()
  })
}
