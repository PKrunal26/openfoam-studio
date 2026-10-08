import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AppConfig } from '../../core/setup/appConfig.js'

const PROJECT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const wait = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds))

export interface TestBackend {
  baseURL: string
  token: string
  sessionCookie: string
  configDir: string
  child: ChildProcess
  request: (route: string, init?: RequestInit) => Promise<Response>
  stop: () => Promise<void>
}

/** Owns a disposable config/project directory and backend. Never connects to port 3456 or user projects. */
export async function startBackend(options: { config?: AppConfig; env?: NodeJS.ProcessEnv } = {}): Promise<TestBackend> {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ofs-backend-test-'))
  fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(options.config ?? {
    llmProvider: 'openai', llmModel: 'offline-test', removedApiKeys: ['anthropic', 'openai', 'google', 'openai-compatible'],
  }), { mode: 0o600 })
  const socket = net.createServer()
  await new Promise<void>((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve) })
  const address = socket.address()
  if (!address || typeof address === 'string') throw new Error('Could not reserve a local test port')
  const port = address.port
  await new Promise<void>(resolve => socket.close(() => resolve()))
  const baseURL = `http://127.0.0.1:${port}`
  const environment: NodeJS.ProcessEnv = { ...process.env, ...options.env, OFS_CONFIG_DIR: configDir, OFS_HOST: '127.0.0.1', OFS_PORT: String(port), OFS_DEV: '0', OFS_CREDENTIAL_IPC: '0' }
  // The test harness cannot accidentally spend inherited provider credentials.
  for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'OFS_SERVER_TOKEN']) delete environment[key]
  const child = spawn(process.execPath, [path.join(PROJECT_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(PROJECT_ROOT, 'demo', 'server.ts')], {
    cwd: PROJECT_ROOT, env: environment, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  child.stdout?.on('data', (chunk: Buffer) => { logs = (logs + chunk.toString()).slice(-65536) })
  child.stderr?.on('data', (chunk: Buffer) => { logs = (logs + chunk.toString()).slice(-65536) })
  let spawnError: Error | undefined
  child.on('error', error => { spawnError = error })
  const stop = async () => {
    if (child.exitCode === null && !child.killed) child.kill('SIGTERM')
    const end = Date.now() + 6_000
    while (child.exitCode === null && child.signalCode === null && Date.now() < end) await wait(25)
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await Promise.race([new Promise<void>(resolve => child.once('exit', () => resolve())), wait(1_000)])
    }
    fs.rmSync(configDir, { recursive: true, force: true })
  }
  try {
    const deadline = Date.now() + 20_000
    let ready = false
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError
      if (child.exitCode !== null) throw new Error(`Test backend exited during startup: ${logs}`)
      try {
        const response = await fetch(new URL('/api/identity', baseURL), { signal: AbortSignal.timeout(1_000) })
        if (response.ok && ((await response.json()) as { application?: string }).application === 'openfoam-studio') { ready = true; break }
      } catch { /* startup may still be compiling */ }
      await wait(50)
    }
    if (!ready) throw new Error(`Test backend did not start: ${logs}`)
    const session = await fetch(new URL('/api/session', baseURL), { signal: AbortSignal.timeout(5_000) })
    const token = ((await session.json()) as { token: string }).token
    const sessionCookie = session.headers.get('set-cookie')?.split(';')[0] ?? ''
    return { baseURL, token, sessionCookie, configDir, child, stop,
      request: (route, init) => {
        const headers = new Headers(init?.headers)
        headers.set('X-OFS-Token', token)
        return fetch(new URL(route, baseURL), { ...init, headers })
      },
    }
  } catch (error) { await stop(); throw error }
}
