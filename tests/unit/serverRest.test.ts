import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { startBackend, type TestBackend } from '../helpers/backend.js'

const json = (value: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })

/** Production REST boundary, isolated from user projects, Docker operations, and paid provider calls. */
describe('production server REST safety', () => {
  let backend: TestBackend
  beforeAll(async () => { backend = await startBackend() })
  afterAll(async () => { await backend?.stop() })

  async function create(starter?: 'cavity' | 'solved-cavity') {
    const response = await backend.request('/api/projects', json({ name: 'REST smoke case', prompt: '', starter }))
    expect(response.status).toBe(201)
    return await response.json() as { id: string; latestRunId?: string; revision?: string; status: string; example?: boolean }
  }
  async function read(id: string, relative = 'system/controlDict') {
    const response = await backend.request(`/api/projects/${id}/file?path=${encodeURIComponent(relative)}`)
    expect(response.status).toBe(200)
    return response.text()
  }

  it('identifies the backend and requires a session for private data and mutation', async () => {
    const identity = await fetch(new URL('/api/identity', backend.baseURL))
    expect(await identity.json()).toMatchObject({ application: 'openfoam-studio', protocol: 1 })
    for (const route of ['/api/projects', '/settings']) expect((await fetch(new URL(route, backend.baseURL))).status).toBe(401)
    expect((await fetch(new URL('/health/fix', backend.baseURL), json({}))).status).toBe(401)
    expect((await fetch(new URL('/api/projects', backend.baseURL), { headers: { Cookie: backend.sessionCookie } })).status).toBe(200)
    expect((await fetch(new URL('/api/projects', backend.baseURL), { headers: { 'X-OFS-Token': 'wrong' } })).status).toBe(401)
    const session = await fetch(new URL('/api/session', backend.baseURL))
    expect(session.headers.get('set-cookie')).toContain('HttpOnly')
    expect(session.headers.get('set-cookie')).toContain('SameSite=Strict')
    const forbidden = await fetch(new URL('/api/session', backend.baseURL), { headers: { Origin: 'https://unrelated.example' } })
    expect(forbidden.status).toBe(403)
    const preflight = await fetch(new URL('/api/projects', backend.baseURL), { method: 'OPTIONS', headers: { Origin: backend.baseURL } })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-headers')).toContain('X-OFS-Token')
    expect(preflight.headers.get('access-control-allow-methods')).toContain('PATCH')
  })

  it('rejects malformed JSON, field types, and oversized bodies while keeping the server available', async () => {
    expect((await backend.request('/api/projects', { ...json({}), body: '{' })).status).toBe(400)
    expect((await backend.request('/api/projects', json({ name: 42 }))).status).toBe(400)
    expect((await backend.request('/settings', json({ model: [] }))).status).toBe(400)
    expect((await backend.request('/settings', json({ removeApiKeys: ['invalid-provider'] }))).status).toBe(400)
    expect((await backend.request('/api/projects', json({ prompt: 'x'.repeat(2 * 1024 * 1024) }))).status).toBe(413)
    expect((await backend.request('/api/projects')).status).toBe(200)
  })

  it('offers both CLIs and preserves the user-selected provider and model on settings reload', async () => {
    const initial = await (await backend.request('/settings')).json() as { providers: Array<{ id: string; defaultModel: string; models: Array<{ id: string }> }> }
    expect(initial.providers.map(provider => provider.id)).toEqual(expect.arrayContaining(['codex-cli', 'claude-cli']))
    expect(initial.providers.find(provider => provider.id === 'claude-cli')).toMatchObject({ defaultModel: 'sonnet' })
    for (const selection of [
      { provider: 'claude-cli', model: 'opus' },
      { provider: 'codex-cli', model: 'gpt-6.1-sol' },
      { provider: 'claude-cli', model: 'haiku' },
    ]) {
      expect((await backend.request('/settings', json(selection))).status).toBe(200)
      const reloaded = await (await backend.request('/settings')).json() as { provider: string; model: string; hasAuth: boolean }
      expect(reloaded).toMatchObject(selection)
      const saved = JSON.parse(fs.readFileSync(path.join(backend.configDir, 'config.json'), 'utf8'))
      expect(saved).toMatchObject({ llmProvider: selection.provider, llmModel: selection.model })
    }
  })

  it('rejects directories, traversal, symlinks, and invalid project IDs without crashing', async () => {
    const project = await create('cavity')
    for (const relative of ['system', '../meta.json', '/etc/passwd']) {
      expect((await backend.request(`/api/projects/${project.id}/file?path=${encodeURIComponent(relative)}`)).status).toBe(400)
    }
    expect((await backend.request('/api/projects/id%2Fbad')).status).toBe(400)
    const outside = path.join(backend.configDir, 'outside.txt')
    fs.writeFileSync(outside, 'private host content')
    fs.symlinkSync(outside, path.join(backend.configDir, 'projects', project.id, 'case', 'system', 'linked'))
    expect((await backend.request(`/api/projects/${project.id}/file?path=system/linked`)).status).toBe(400)
    expect((await backend.request(`/api/projects/${project.id}/file?path=system/linked`, { ...json({ content: 'overwrite' }), method: 'PUT' })).status).toBe(400)
    expect(fs.readFileSync(outside, 'utf8')).toBe('private host content')
    expect((await backend.request('/api/projects')).status).toBe(200)
  })

  it('requires expected contents, rejects stale saves, normalizes LF, and invalidates readiness', async () => {
    const project = await create('cavity')
    const original = await read(project.id)
    const route = `/api/projects/${project.id}/file?path=system/controlDict`
    expect((await backend.request(route, { ...json({ content: original }), method: 'PUT' })).status).toBe(428)
    expect((await backend.request(route, { ...json({ content: original, expectedContent: 'stale' }), method: 'PUT' })).status).toBe(409)
    const content = original + '\r\n// saved revision\r'
    expect((await backend.request(route, { ...json({ content, expectedContent: original }), method: 'PUT' })).status).toBe(200)
    expect(await read(project.id)).toBe(original + '\n// saved revision\n')
    expect((await backend.request(route, { ...json({ content: original, expectedContent: original }), method: 'PUT' })).status).toBe(409)
    const meta = await (await backend.request(`/api/projects/${project.id}`)).json() as { status: string; revision: string }
    expect(meta.status).toBe('unvalidated')
    expect(meta.revision).not.toBe(project.revision)
  })

  it('keeps case inputs and result identity when chat is cleared and project is renamed', async () => {
    const project = await create('solved-cavity')
    const before = await read(project.id)
    expect((await backend.request(`/api/projects/${project.id}/messages`, { method: 'DELETE' })).status).toBe(204)
    const renamed = await backend.request(`/api/projects/${project.id}`, { ...json({ name: 'Named reference' }), method: 'PATCH' })
    expect(renamed.status).toBe(200)
    expect(await renamed.json()).toMatchObject({ name: 'Named reference', latestRunId: project.latestRunId, messages: [] })
    expect(await read(project.id)).toBe(before)
  })

  it('preserves selected immutable results after changing inputs and describes reference validation', async () => {
    const project = await create('solved-cavity')
    expect(project.example).toBe(true)
    const manifestRoute = `/api/projects/${project.id}/vtk/manifest?runId=${project.latestRunId}`
    const manifest = await (await backend.request(manifestRoute)).json() as { runId: string; stale: boolean; files: { relPath: string }[]; validation: { solverCompleted: boolean; warnings: string[] } }
    expect(manifest.runId).toBe(project.latestRunId)
    expect(manifest.stale).toBe(false)
    expect(manifest.validation.solverCompleted).toBe(false)
    expect(manifest.validation.warnings.join(' ')).toContain('reference')
    const file = manifest.files[0]!
    const fileRoute = `/api/projects/${project.id}/vtk/file?runId=${project.latestRunId}&path=${encodeURIComponent(file.relPath)}`
    const resultBefore = Buffer.from(await (await backend.request(fileRoute)).arrayBuffer())
    const original = await read(project.id)
    expect((await backend.request(`/api/projects/${project.id}/file?path=system/controlDict`, { ...json({ content: original + '\n// new revision\n', expectedContent: original }), method: 'PUT' })).status).toBe(200)
    const stale = await (await backend.request(manifestRoute)).json() as { stale: boolean }
    expect(stale.stale).toBe(true)
    expect(Buffer.from(await (await backend.request(fileRoute)).arrayBuffer())).toEqual(resultBefore)
    expect((await backend.request(`/api/projects/${project.id}/vtk/manifest?runId=missing-run`)).status).toBe(404)
  })

  it('exports and imports reproducible projects under new identity and rejects hostile archives', async () => {
    const project = await create('solved-cavity')
    const response = await backend.request(`/api/projects/${project.id}/export`)
    expect(response.status).toBe(200)
    const archive = await response.json() as { files: { path: string; encoding: string; content: string }[] }
    const importedResponse = await backend.request('/api/projects/import', json(archive))
    expect(importedResponse.status).toBe(201)
    const imported = await importedResponse.json() as { id: string; latestRunId: string; status: string }
    expect(imported.id).not.toBe(project.id)
    expect(imported.status).toBe('unvalidated')
    expect(await read(imported.id)).toBe(await read(project.id))
    const manifest = await (await backend.request(`/api/projects/${imported.id}/vtk/manifest?runId=${imported.latestRunId}`)).json() as { files: unknown[] }
    expect(manifest.files.length).toBeGreaterThan(0)
    const hostile = structuredClone(archive)
    hostile.files.push({ path: '../outside', encoding: 'base64', content: Buffer.from('escape').toString('base64') })
    expect((await backend.request('/api/projects/import', json(hostile))).status).toBe(400)
    const executable = structuredClone(archive)
    const dictionary = executable.files.find(file => file.path === 'case/system/controlDict')!
    dictionary.content = Buffer.from('#codeStream { code #{ system("bad"); #}; }').toString('base64')
    expect((await backend.request('/api/projects/import', json(executable))).status).toBe(422)
    expect((await backend.request('/api/projects')).status).toBe(200)
  })

  it('removes and replaces provider keys explicitly without leaking them in settings or shared data', async () => {
    const secret = 'sk-rest-smoke-secret-1234567890'
    expect((await backend.request('/settings', json({ provider: 'openai', apiKey: secret, model: 'offline-test' }))).status).toBe(200)
    const configured = await (await backend.request('/settings')).json() as { hasAuth: boolean; hasKeys: { openai: boolean } }
    expect(configured.hasAuth).toBe(true)
    expect(configured.hasKeys.openai).toBe(true)
    expect(JSON.stringify(configured)).not.toContain(secret)
    const project = await create('cavity')
    const metaPath = path.join(backend.configDir, 'projects', project.id, 'meta.json')
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as { messages: unknown[] }
    meta.messages.push({ role: 'user', content: `Accidentally pasted ${secret} and Bearer token123456`, timestamp: new Date().toISOString() })
    fs.writeFileSync(metaPath, JSON.stringify(meta))
    const archive = await (await backend.request(`/api/projects/${project.id}/export`)).text()
    expect(archive).not.toContain(secret)
    const support = await (await backend.request(`/api/projects/${project.id}/support`)).text()
    expect(support).not.toContain(secret)
    expect(support).not.toContain('token123456')
    expect((await backend.request('/settings', json({ removeApiKeys: ['openai'] }))).status).toBe(200)
    const removed = await (await backend.request('/settings')).json() as { hasAuth: boolean; hasKeys: { openai: boolean } }
    expect(removed.hasAuth).toBe(false)
    expect(removed.hasKeys.openai).toBe(false)
    expect((await backend.request('/settings', json({ apiKey: secret }))).status).toBe(200)
    const replaced = await (await backend.request('/settings')).json() as { hasAuth: boolean }
    expect(replaced.hasAuth).toBe(true)
    // Remove the fake key before any operation test.
    expect((await backend.request('/settings', json({ removeApiKeys: ['openai'] }))).status).toBe(200)
  })

  it('rejects mutation while another job owns a project, and clears the lock after a request error', async () => {
    const project = await create('cavity')
    const pending = http.request(new URL(`/api/projects/${project.id}/generate`, backend.baseURL), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-OFS-Token': backend.token } })
    pending.on('error', () => undefined)
    pending.write('{"prompt":')
    try {
      await new Promise(resolve => setTimeout(resolve, 100))
      expect((await backend.request(`/api/projects/${project.id}`, { method: 'DELETE' })).status).toBe(409)
      expect((await backend.request(`/api/projects/${project.id}/messages`, { method: 'DELETE' })).status).toBe(409)
      expect((await backend.request(`/api/projects/${project.id}/stop`, json({}))).status).toBe(200)
    } finally { pending.destroy() }
    let response: Response | undefined
    for (let attempt = 0; attempt < 30; attempt++) {
      response = await backend.request(`/api/projects/${project.id}`, { ...json({ name: 'Lock released' }), method: 'PATCH' })
      if (response.status !== 409) break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    expect(response?.status).toBe(200)
  })

  it('preflights every recovery patch before changing case inputs', async () => {
    const project = await create('cavity')
    const original = await read(project.id)
    const response = await backend.request(`/api/projects/${project.id}/apply-fix`, json({ fix: [
      { file: 'system/controlDict', description: 'First valid change', oldValue: 'deltaT', newValue: 'deltaT /* recovery candidate */', expectedContent: original },
      { file: 'system/fvSolution', description: 'Stale second file', oldValue: 'PIMPLE', newValue: 'PIMPLE', expectedContent: 'stale' },
    ] }))
    expect([409, 422]).toContain(response.status)
    expect(await read(project.id)).toBe(original)
    expect((await backend.request(`/api/projects/${project.id}/apply-fix`, json({ fix: [{ file: 'system/controlDict' }] }))).status).toBe(400)
  })

  it('restores input contents when storing the new revision metadata fails', async () => {
    if (process.platform === 'win32' || process.getuid?.() === 0) return
    const project = await create('cavity')
    const original = await read(project.id)
    const directory = path.join(backend.configDir, 'projects', project.id)
    const permissions = fs.statSync(directory).mode & 0o777
    fs.chmodSync(directory, 0o500)
    try {
      const response = await backend.request(`/api/projects/${project.id}/file?path=system/controlDict`, { ...json({ content: original + '\n// rejected storage write\n', expectedContent: original }), method: 'PUT' })
      expect(response.status).toBe(500)
      expect(await read(project.id)).toBe(original)
    } finally { fs.chmodSync(directory, permissions) }
  })

  it('deletes into recoverable trash instead of erasing project files', async () => {
    const project = await create('cavity')
    const before = await read(project.id)
    expect((await backend.request(`/api/projects/${project.id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await backend.request(`/api/projects/${project.id}`)).status).toBe(404)
    const trash = path.join(backend.configDir, 'projects', '.trash')
    const saved = fs.readdirSync(trash).find(entry => entry.startsWith(project.id + '-'))!
    expect(fs.readFileSync(path.join(trash, saved, 'case', 'system', 'controlDict'), 'utf8')).toBe(before)
  })
})
