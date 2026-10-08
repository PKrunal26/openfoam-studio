/** Stage 5: real selected provider through the production HTTP generation path.
 * Run only after ordered Stage 0–4 gates pass. Uses disposable projects/config,
 * never the user's projects; each real provider request has a bounded timeout.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { getActiveModel, getActiveProvider, getProviderKey, readConfig, type AppConfig } from '../../core/setup/appConfig.js'
import { startBackend, type TestBackend } from '../helpers/backend.js'

interface Project {
  id: string
  name: string
  status: string
  revision?: string
  validation?: { ok: boolean; note: string }
  messages?: Array<{ role: string; content: string; filesChanged?: string[]; agentSteps?: Array<{ tool: string; ok: boolean; summary?: string }> }>
}
interface StreamEvent { type: string; status?: string; files?: string[]; revision?: string; tool?: string; ok?: boolean; args?: { cmd?: string }; summary?: string }
const post = (value: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })

describe.sequential('Stage 5 — production provider conversation', () => {
  let backend: TestBackend
  beforeAll(async () => {
    const selected = readConfig()
    const provider = getActiveProvider(selected)
    const config: AppConfig = { ...selected, llmProvider: provider, llmModel: getActiveModel(selected) }
    delete config.apiKeys
    delete config.anthropicApiKey
    // Explicit production-path test authorization: pass only the selected key
    // from an environment-backed setup, instead of inheriting every provider.
    if (provider !== 'codex-cli' && provider !== 'claude-cli') {
      const key = getProviderKey(provider, selected)
      if (key) config.apiKeys = { [provider]: key }
    }
    backend = await startBackend({ config })
    if (process.platform !== 'win32') expect(fs.statSync(path.join(backend.configDir, 'config.json')).mode & 0o777).toBe(0o600)
    const response = await backend.request('/settings')
    expect(response.status).toBe(200)
    const actual = await response.json() as { provider: string; model: string }
    expect(actual.provider).toBe(provider)
    expect(actual.model).toBe(getActiveModel(selected))
  }, 30_000)
  afterAll(async () => { await backend?.stop() })

  async function create(name: string, starter?: 'cavity'): Promise<Project> {
    const response = await backend.request('/api/projects', post({ name, ...(starter ? { starter } : {}) }))
    expect(response.status).toBe(201)
    return response.json() as Promise<Project>
  }
  async function project(id: string): Promise<Project> {
    const response = await backend.request(`/api/projects/${id}`)
    expect(response.status).toBe(200)
    return response.json() as Promise<Project>
  }
  async function inputs(id: string): Promise<Record<string, string>> {
    const response = await backend.request(`/api/projects/${id}/files`)
    expect(response.status).toBe(200)
    const entries = await response.json() as Array<{ relPath: string }>
    const files: Record<string, string> = {}
    for (const entry of entries.filter(file => /^(?:0|constant|system)\//.test(file.relPath) && !file.relPath.startsWith('constant/polyMesh/')).sort((a, b) => a.relPath.localeCompare(b.relPath))) {
      const file = await backend.request(`/api/projects/${id}/file?path=${encodeURIComponent(entry.relPath)}`)
      expect(file.status).toBe(200)
      files[entry.relPath] = await file.text()
    }
    return files
  }
  const hashes = (files: Record<string, string>) => Object.fromEntries(Object.entries(files).map(([name, content]) => [name, createHash('sha256').update(content).digest('hex')]))
  async function generate(id: string, prompt: string, intent: 'question' | 'edit'): Promise<StreamEvent[]> {
    const response = await backend.request(`/api/projects/${id}/generate`, { ...post({ prompt, intent }), signal: AbortSignal.timeout(240_000) })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const body = await response.text()
    const events = body.split(/\r?\n\r?\n/).flatMap(block => {
      const data = block.split(/\r?\n/).filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('\n')
      return data ? [JSON.parse(data) as StreamEvent] : []
    })
    // Do not print provider responses or credentials in a failed assertion.
    expect(events.filter(event => event.type === 'error').length).toBe(0)
    expect(events.filter(event => event.type === 'done').length).toBe(1)
    return events
  }

  it('explains the reviewed starter while preserving every input hash, revision and project name', async () => {
    const created = await create('Preserved reviewed cavity', 'cavity')
    const before = await inputs(created.id)
    expect(Object.keys(before).length).toBe(8)
    const events = await generate(created.id, 'Explain why this existing laminar lid-driven cavity case uses noSlip on its stationary walls and empty front/back boundary conditions. Answer from these actual files; do not propose any edits.', 'question')
    expect(events.find(event => event.type === 'done')).toMatchObject({ status: created.status, files: [], revision: created.revision })
    expect(hashes(await inputs(created.id))).toEqual(hashes(before))
    const after = await project(created.id)
    expect(after.name).toBe(created.name)
    expect(after.revision).toBe(created.revision)
    const answer = after.messages?.filter(message => message.role === 'assistant').at(-1)
    expect(answer?.content.length ?? 0).toBeGreaterThan(30)
    expect(answer?.content).toMatch(/wall|empty|two[- ]dimensional|2D/i)
    expect(answer?.filesChanged).toEqual([])
  }, 260_000)

  it('saves only the requested endTime refinement and reports deterministic validation evidence', async () => {
    const created = await create('Precisely refined cavity', 'cavity')
    const before = await inputs(created.id)
    const events = await generate(created.id, 'In this existing case, change ONLY endTime in system/controlDict from 10 to 2 seconds. Preserve every other byte and every other input file, including deltaT, writeInterval, fluid properties, boundary conditions and mesh. This is an explicit numerical refinement; do not generate a new case.', 'edit')
    expect(events.find(event => event.type === 'done')).toMatchObject({ status: 'ready', files: ['system/controlDict'] })
    const after = await inputs(created.id)
    expect(Object.keys(after)).toEqual(Object.keys(before))
    for (const name of Object.keys(before).filter(name => name !== 'system/controlDict')) expect(hashes({ [name]: after[name]! })).toEqual(hashes({ [name]: before[name]! }))
    expect(after['system/controlDict']).toMatch(/\bendTime\s+2\s*;/)
    expect(after['system/controlDict']!.replace(/\bendTime\s+2\s*;/, 'endTime __END__;')).toBe(before['system/controlDict']!.replace(/\bendTime\s+10\s*;/, 'endTime __END__;'))
    const meta = await project(created.id)
    expect(meta.name).toBe(created.name)
    expect(meta.revision).not.toBe(created.revision)
    expect(meta.validation?.ok).toBe(true)
    expect(meta.validation?.note).toContain('finite-value checks')
    const steps = meta.messages?.filter(message => message.role === 'assistant').at(-1)?.agentSteps ?? []
    for (const command of ['blockMesh', 'checkMesh', 'foamRun']) expect(steps.some(step => step.tool === 'run_command' && step.summary === command && step.ok)).toBe(true)
  }, 260_000)

  it('asks for missing physics on an empty project and leaves needs-input without inventing a case', async () => {
    const created = await create('Ambiguous physical problem')
    const events = await generate(created.id, 'Set up a simulation of fluid flowing through my device. I have not specified the fluid, its properties, geometry or dimensions, boundary conditions, flow rate, or whether heat transfer is needed. Ask for the material missing inputs before writing any case files; do not choose default physical values.', 'edit')
    expect(events.find(event => event.type === 'done')).toMatchObject({ status: 'needs-input', files: [] })
    expect(await inputs(created.id)).toEqual({})
    const meta = await project(created.id)
    expect(meta.status).toBe('needs-input')
    expect(meta.name).toBe(created.name)
    const answer = meta.messages?.filter(message => message.role === 'assistant').at(-1)
    expect(answer?.content).toMatch(/fluid|geometr|dimension|boundary|flow rate/i)
    expect(answer?.filesChanged).toEqual([])
    expect(meta.validation).toBeUndefined()
  }, 260_000)
})
