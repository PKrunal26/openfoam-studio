import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function resolveCodexBin(): string | null {
  const executable = process.platform === 'win32' ? 'codex.exe' : 'codex'
  const candidates = [
    ...(process.env['PATH'] ?? '').split(path.delimiter).filter(Boolean).map(directory => path.join(directory, executable)),
    path.join('/Applications', 'ChatGPT.app', 'Contents', 'Resources', 'codex-cli', 'CodexCLI.app', 'Contents', 'MacOS', 'codex'),
    path.join('/Applications', 'Codex.app', 'Contents', 'Resources', 'codex'),
    path.join(os.homedir(), '.local', 'bin', executable),
  ]
  for (const candidate of candidates) {
    try { fs.accessSync(candidate, fs.constants.X_OK); if (fs.statSync(candidate).isFile()) return candidate } catch { /* next */ }
  }
  return null
}
export function findCodexBin(): string {
  const binary = resolveCodexBin()
  if (!binary) throw new Error('Codex CLI was not found. Install Codex and sign in using codex login.')
  return binary
}

/** Explicit feature disabling supplements read-only isolation: no shell reaches the model. */
export function restrictedCodexArgs(binary: string): string[] {
  const help = execFileSync(binary, ['exec', '--help'], { encoding: 'utf8', timeout: 5000, maxBuffer: 128 * 1024 })
  for (const flag of ['--ignore-user-config', '--ignore-rules', '--ephemeral', '--sandbox', '--output-schema', '--json', '--disable']) {
    if (!help.includes(flag)) throw new Error(`Codex CLI lacks required restricted-mode flag ${flag}; update Codex. No unrestricted fallback is allowed.`)
  }
  const disabled = ['shell_tool', 'unified_exec', 'unified_exec_tty', 'shell_snapshot', 'apps', 'plugins', 'hooks', 'skill_search',
    'skill_mcp_dependency_install', 'browser_annotation_api', 'browser_use', 'browser_use_external', 'browser_use_full_cdp_access',
    'computer_use', 'code_mode', 'code_mode_only', 'multi_agent', 'multi_agent_v2', 'goals', 'image_generation', 'view_image',
    'sleep_tool', 'workspace_dependencies', 'worktrees', 'remote_plugin', 'in_app_browser', 'in_app_chat', 'in_app_local_automation',
    'tool_suggest', 'memories', 'agent_message_board', 'enable_mcp_apps', 'mcp_2026_07_28', 'codex_apps_mcp_2026_07_28']
  return ['--ignore-user-config', '--ignore-rules', '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check',
    ...disabled.flatMap(feature => ['--disable', feature]), '--enable', 'skip_host_skill_discovery', '--enable', 'code_mode_host',
    '-c', 'web_search="disabled"', '-c', 'mcp_servers={}', '-c', 'approval_policy="never"',
    '-c', 'suppress_unstable_features_warning=true']
}

export function restrictedCodexEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { FORCE_COLOR: '0' }
  for (const key of ['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT', 'APPDATA', 'LOCALAPPDATA', 'CODEX_HOME', 'OPENAI_API_KEY']) {
    if (process.env[key] !== undefined) env[key] = process.env[key]
  }
  // Some Codex models require the bundled Code Mode transport even with shell
  // tools disabled. Resolve the reviewed host beside the app's CLI; it does
  // not grant the model shell/file/integration tools.
  const hostDirectory = path.join('/Applications', 'ChatGPT.app', 'Contents', 'Resources', 'codex-cli', 'bin')
  if (fs.existsSync(path.join(hostDirectory, 'codex-code-mode-host'))) env['PATH'] = [env['PATH'], hostDirectory].filter(Boolean).join(path.delimiter)
  return env
}

const TEXT_SCHEMA = { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } } }

/** Codex produces text/typed proposals from supplied context; the app owns all file changes. */
export async function runCodex(systemPrompt: string, userPrompt: string, onText?: (text: string) => void, model = 'gpt-6.1-sol', options: {
  signal?: AbortSignal; timeoutMs?: number; schema?: Record<string, unknown>
} = {}): Promise<string> {
  const signal = AbortSignal.any([options.signal ?? new AbortController().signal, AbortSignal.timeout(options.timeoutMs ?? 120_000)])
  signal.throwIfAborted()
  const binary = findCodexBin()
  const safetyArgs = restrictedCodexArgs(binary)
  signal.throwIfAborted()
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ofs-codex-'))
  const schemaFile = path.join(temporary, 'response.schema.json')
  const resultFile = path.join(temporary, 'response.json')
  fs.writeFileSync(schemaFile, JSON.stringify(options.schema ?? TEXT_SCHEMA), 'utf8')
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(binary, ['exec', ...safetyArgs, '--model', model, '--color', 'never', '--json',
        '--output-schema', schemaFile, '--output-last-message', resultFile, '-'], {
        cwd: temporary, env: restrictedCodexEnv(), stdio: ['pipe', 'pipe', 'pipe'], shell: false,
      })
      let stderr = ''
      let lineBuffer = ''
      let outputBytes = 0
      let failure: Error | undefined
      let completed = false
      let killTimer: NodeJS.Timeout | undefined
      const kill = () => { child.kill('SIGTERM'); killTimer ??= setTimeout(() => child.kill('SIGKILL'), 1000); killTimer.unref() }
      const abort = () => kill()
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
      const cleanup = () => { signal.removeEventListener('abort', abort); if (killTimer) clearTimeout(killTimer) }
      child.stdin.on('error', error => { failure = error; kill() })
      child.stdout.on('data', (chunk: Buffer) => {
        outputBytes += chunk.length
        if (outputBytes > 8 * 1024 * 1024) { failure = new Error('Codex output exceeded the supported limit'); kill(); return }
        lineBuffer += chunk.toString('utf8')
        const lines = lineBuffer.split('\n'); lineBuffer = lines.pop() ?? ''
        for (const line of lines) {
          try {
            const event = JSON.parse(line) as { type?: string; error?: { message?: string }; message?: string; item?: { type?: string; text?: string; message?: string; error?: { message?: string } } }
            if (event.type === 'turn.completed') completed = true
            if (event.type === 'turn.failed' || event.type === 'error') { failure = new Error(event.error?.message ?? event.message ?? 'Codex failed'); kill() }
            if (event.item?.type === 'error') {
              failure = new Error(event.item.message ?? event.item.error?.message ?? event.item.text ?? 'Codex reported an error'); kill()
            } else if (event.item?.type && !['agent_message', 'reasoning', 'plan'].includes(event.item.type)) {
              failure = new Error(`Codex attempted a disabled tool (${event.item.type})`); kill()
            }
          } catch { /* a non-event diagnostic cannot establish success */ }
        }
      })
      child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString('utf8')).slice(-64 * 1024) })
      child.on('error', error => { cleanup(); reject(error) })
      child.on('close', code => {
        cleanup()
        if (signal.aborted) reject(signal.reason)
        else if (failure) reject(failure)
        else if (code !== 0 || !completed) reject(new Error(`Codex did not complete (exit ${code}): ${stderr.slice(-2000)}`))
        else resolve()
      })
      child.stdin.end(`System instructions:\n${systemPrompt}\n\nUse only supplied context. No tools, commands or file changes are permitted. Return the required structured response.\n\nUser request:\n${userPrompt}`, 'utf8')
    })
    signal.throwIfAborted()
    const stat = fs.statSync(resultFile)
    if (stat.size > 8 * 1024 * 1024) throw new Error('Codex response exceeded the supported limit')
    const result = fs.readFileSync(resultFile, 'utf8')
    if (options.schema) return result
    const parsed: unknown = JSON.parse(result)
    if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length !== 1 || !('text' in parsed) || typeof parsed.text !== 'string') throw new Error('Codex returned a malformed text response')
    onText?.(parsed.text)
    return parsed.text
  } finally { fs.rmSync(temporary, { recursive: true, force: true }) }
}
