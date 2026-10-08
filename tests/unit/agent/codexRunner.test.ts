import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
const mocks = vi.hoisted(() => ({ spawn: vi.fn(), execFileSync: vi.fn() }))
vi.mock('node:child_process', () => mocks)
import { restrictedCodexArgs, restrictedCodexEnv, runCodex } from '../../../core/agent/codex-runner.js'
const help = '--ignore-user-config --ignore-rules --ephemeral --sandbox --output-schema --json --disable'
let binaries: string
beforeEach(() => {
  mocks.spawn.mockReset(); mocks.execFileSync.mockReturnValue(help)
  binaries = fs.mkdtempSync(path.join(os.tmpdir(), 'ofs-codex-bin-test-'))
  fs.writeFileSync(path.join(binaries, process.platform === 'win32' ? 'codex.exe' : 'codex'), 'test executable', { mode: 0o755 })
  vi.stubEnv('PATH', binaries)
})
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(binaries, { recursive: true, force: true }) })
function fakeChild(onEnd: (args: string[], child: EventEmitter) => void) {
  mocks.spawn.mockImplementation((_binary, args) => {
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; stdin: EventEmitter & { end: () => void }; kill: ReturnType<typeof vi.fn> }
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter() as typeof child.stdin
    child.kill = vi.fn()
    child.stdin.end = () => queueMicrotask(() => onEnd(args, child))
    return child
  })
}
describe('Codex text-only execution contract', () => {
  it('disables raw shell, integrations and inherited configuration and fails closed on old CLIs', () => {
    const args = restrictedCodexArgs('/test/codex')
    expect(args.join(' ')).toContain('--disable shell_tool')
    expect(args.join(' ')).toContain('--disable unified_exec')
    expect(args.join(' ')).toContain('--disable apps')
    expect(args.join(' ')).toContain('--disable plugins')
    expect(args).toEqual(expect.arrayContaining(['--ignore-user-config', '--ignore-rules', '--ephemeral', 'read-only', 'approval_policy="never"']))
    mocks.execFileSync.mockReturnValue('old CLI help')
    expect(() => restrictedCodexArgs('/test/codex')).toThrow(/No unrestricted fallback/)
  })
  it('does not inherit arbitrary integration or endpoint environment variables', () => {
    vi.stubEnv('OPENAI_BASE_URL', 'https://unexpected.example'); vi.stubEnv('CUSTOM_SECRET', 'secret')
    vi.stubEnv('OPENAI_API_KEY', 'authorized-key')
    const env = restrictedCodexEnv()
    expect(env['OPENAI_BASE_URL']).toBeUndefined(); expect(env['CUSTOM_SECRET']).toBeUndefined()
    expect(env['OPENAI_API_KEY']).toBe('authorized-key')
  })
  it('returns the validated final text only after a completed terminal event', async () => {
    fakeChild((args, child) => {
      fs.writeFileSync(args[args.indexOf('--output-last-message') + 1]!, '{"text":"OK"}')
      ;(child as { stdout: EventEmitter }).stdout.emit('data', Buffer.from('{"type":"turn.completed"}\n'))
      child.emit('close', 0)
    })
    await expect(runCodex('system', 'request')).resolves.toBe('OK')
    expect(mocks.spawn.mock.calls[0]![2].shell).toBe(false)
  })
  it('preserves the real error reason instead of treating an error item as a tool', async () => {
    fakeChild((_args, child) => {
      ;(child as { stdout: EventEmitter }).stdout.emit('data', Buffer.from('{"type":"item.completed","item":{"type":"error","message":"Model is unavailable"}}\n'))
      child.emit('close', 1)
    })
    await expect(runCodex('system', 'request')).rejects.toThrow('Model is unavailable')
  })
  it('rejects tool activity even when the process exits zero', async () => {
    fakeChild((_args, child) => {
      ;(child as { stdout: EventEmitter }).stdout.emit('data', Buffer.from('{"type":"item.started","item":{"type":"command_execution"}}\n{"type":"turn.completed"}\n'))
      child.emit('close', 0)
    })
    await expect(runCodex('system', 'request')).rejects.toThrow('disabled tool (command_execution)')
  })
  it('never spawns a subprocess when already cancelled', async () => {
    const controller = new AbortController(); controller.abort()
    await expect(runCodex('system', 'request', undefined, undefined, { signal: controller.signal })).rejects.toThrow()
    expect(mocks.spawn).not.toHaveBeenCalled()
  })
})
