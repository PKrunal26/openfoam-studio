/**
 * Stage 3 — Error recovery integration test
 *
 * Requires Docker + OpenFOAM image.  Runtime: ~4 min.
 *
 * Flow:
 *  1. Start a fresh project with a valid cavity case (copied from fixture).
 *  2. Corrupt 0/U with an invalid patchField type to trigger "bad-boundary-condition".
 *  3. POST /run — collect SSE events, assert a `diagnosis` event is received.
 *  4. POST /apply-fix — re-run, assert `done` event and solver success.
 *  5. Assert meta.retryCount === 1.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = 'http://localhost:3456'
const FIXTURE_DIR = path.join(__dirname, '../fixtures/generated/cavity')

// ── helpers ────────────────────────────────────────────────────────────────

async function apiPost(path: string, body: unknown = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res
}

async function apiGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}${path}`)
  return res.json() as Promise<Record<string, unknown>>
}

async function collectSSE(path: string, body: unknown = {}): Promise<{ events: unknown[]; solverOk: boolean }> {
  const events: unknown[] = []
  let solverOk = false

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      try {
        const ev = JSON.parse(line.slice(5).trim())
        events.push(ev)
        if (ev.type === 'exit' && ev.cmd === 'foamRun' && ev.code === 0) solverOk = true
      } catch { /* ignore malformed */ }
    }
  }

  return { events, solverOk }
}

// ── test ───────────────────────────────────────────────────────────────────

describe('F05 Error recovery integration', () => {
  let projectId: string

  beforeAll(async () => {
    // Create project
    const res = await apiPost('/api/projects', { name: 'error-recovery-test' })
    const meta = await res.json() as Record<string, unknown>
    projectId = meta['id'] as string

    // Copy fixture case files into project
    const caseDir = path.join(__dirname, '../../demo/projects', projectId, 'case')
    fs.mkdirSync(caseDir, { recursive: true })
    const copyDir = (src: string, dst: string) => {
      fs.mkdirSync(dst, { recursive: true })
      for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name)
        const d = path.join(dst, entry.name)
        if (entry.isDirectory()) copyDir(s, d)
        else fs.copyFileSync(s, d)
      }
    }
    copyDir(FIXTURE_DIR, caseDir)

    // Corrupt 0/U: replace a valid wall patchField type with an invalid one
    const uFile = path.join(caseDir, '0/U')
    const content = fs.readFileSync(uFile, 'utf8')
    const corrupted = content.replace(
      /type\s+noSlip/,
      'type            fixedGradient'
    )
    fs.writeFileSync(uFile, corrupted, 'utf8')
  }, 10_000)

  afterAll(async () => {
    if (projectId) {
      await fetch(`${BASE_URL}/api/projects/${projectId}`, { method: 'DELETE' })
    }
  })

  it('emits a diagnosis event when foamRun fails with bad BC', async () => {
    const { events } = await collectSSE(`/api/projects/${projectId}/run`)
    const diagnosisEvent = events.find((e: any) => e.type === 'diagnosis')
    expect(diagnosisEvent).toBeDefined()
    const ev = diagnosisEvent as any
    expect(ev.result.errorClass).toBe('bad-boundary-condition')
    expect(ev.result.fix[0].file).toBe('0/U')
  }, 240_000)

  it('recovers in ≤2 retries after applying the fix', async () => {
    // Get the diagnosis from the previous run's meta state
    const meta = await apiGet(`/api/projects/${projectId}`)
    expect(meta['retryCount'] ?? 0).toBe(0) // not yet applied

    // Get diagnosis result — re-run to get it (or we could store it from above test)
    // Apply-fix with the known fix for bad BC
    const fix = [
      {
        file: '0/U',
        description: 'Replace fixedGradient with noSlip',
        oldValue: 'type            fixedGradient',
        newValue: 'type            noSlip',
      },
    ]

    const { events, solverOk } = await collectSSE(
      `/api/projects/${projectId}/apply-fix`,
      { fix }
    )

    expect(solverOk).toBe(true)
    const doneEvent = events.find((e: any) => e.type === 'done')
    expect(doneEvent).toBeDefined()

    const updatedMeta = await apiGet(`/api/projects/${projectId}`)
    expect(updatedMeta['retryCount']).toBe(1)
  }, 240_000)
})
