import { spawn } from 'child_process'
import { execSync } from 'child_process'
import * as os from 'os'

/**
 * Locate the `claude` binary, returning its path or null if not found.
 *
 * macOS apps launched from Finder/a .dmg inherit a minimal launchd PATH
 * (typically just /usr/bin:/bin:/usr/sbin:/sbin) that excludes the usual
 * install dirs, so a bare `which claude` fails even when the CLI is installed.
 * We therefore also consult the user's login shell (which sources their
 * profile and so has the real PATH) and a list of common install locations.
 */
export function resolveClaudeBin(): string | null {
  // 1. `which` against the current process PATH (works when launched from a
  //    terminal or when the GUI PATH happens to include the install dir).
  try {
    const result = execSync('which claude', { encoding: 'utf8' }).trim()
    if (result) return result
  } catch { /* not in PATH */ }

  // 2. Ask the user's login shell — this picks up nvm/asdf/custom npm prefixes
  //    that only exist in their shell profile, not in the GUI launchd PATH.
  if (process.platform !== 'win32') {
    const shell = process.env['SHELL'] || '/bin/zsh'
    try {
      const result = execSync(`'${shell}' -lic 'command -v claude' 2>/dev/null`, {
        encoding: 'utf8',
      })
        .trim()
        .split('\n')
        .pop()
        ?.trim()
      if (result && result.startsWith('/')) return result
    } catch { /* shell lookup failed */ }
  }

  // 3. Common install locations (native installer, npm -g prefixes, homebrew).
  const home = os.homedir()
  const candidates = [
    `${home}/.local/bin/claude`,
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    `${home}/.npm-global/bin/claude`,
    `${home}/.bun/bin/claude`,
    `${home}/node_modules/.bin/claude`,
  ]
  for (const p of candidates) {
    try {
      execSync(`test -x "${p}"`)
      return p
    } catch { /* not found */ }
  }

  return null
}

export function findClaudeBin(): string {
  return resolveClaudeBin() ?? 'claude' // bare name lets spawn fail with a clear ENOENT
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
): Promise<string> {
  return new Promise((resolve, reject) => {
    const streaming = !!onText
    const args = [
      '-p',
      '--output-format', streaming ? 'stream-json' : 'json',
      ...(streaming ? ['--verbose'] : []),
      ...(model ? ['--model', model] : []),
      '--no-session-persistence',
      '--system-prompt', systemPrompt,
    ]

    const claudeBin = findClaudeBin()
    const proc = spawn(claudeBin, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })
    let stdout = ''
    let stderr = ''
    let lineBuf = ''
    let seenTextLen = 0   // track how much text we've already forwarded

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdout += text

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

    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn claude CLI: ${err.message}. Is claude installed?`))
    })

    proc.on('close', (code) => {
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
