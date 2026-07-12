/**
 * Unit tests for the agent tools — pure local logic only (no LLM, no Docker).
 *
 * Each test exercises one tool's execute path against a temp case dir, asserts
 * side effects on disk and that the AgentEvent stream is well-formed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { makeTools, type AgentEvent } from '../../../core/agent/tools.js'
import { _resetDocsIndex } from '../../../core/agent/DocsIndex.js'

let tmpDir: string
let events: AgentEvent[]
let tools: ReturnType<typeof makeTools>

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ofs-tools-'))
  events = []
  _resetDocsIndex()
  tools = makeTools({
    caseDir: tmpDir,
    docker: null,
    onEvent: (e) => events.push(e),
  })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

/** Helper: tools.foo.execute is the real callable; cast to a flexible signature. */
const exec = <T>(t: { execute?: unknown }, args: T): Promise<unknown> => {
  const fn = t.execute as (a: T, ctx?: unknown) => Promise<unknown>
  return fn(args, {} as never)
}

describe('write_case_file', () => {
  it('writes a file under caseDir, normalises CRLF, emits a file event', async () => {
    const result = await exec(tools.write_case_file, {
      path: 'system/controlDict',
      content: 'application icoFoam;\r\nsolver foamRun;\r\n',
    })

    const written = fs.readFileSync(path.join(tmpDir, 'system/controlDict'), 'utf8')
    expect(written).toBe('application icoFoam;\nsolver foamRun;\n')
    expect(result).toMatchObject({ path: 'system/controlDict', bytesWritten: written.length })
    expect(events.find((e) => e.type === 'file')).toMatchObject({
      type: 'file',
      path: 'system/controlDict',
    })
  })

  it('creates intermediate directories', async () => {
    await exec(tools.write_case_file, { path: '0/U', content: 'foo' })
    expect(fs.existsSync(path.join(tmpDir, '0/U'))).toBe(true)
  })

  it('rejects absolute paths', async () => {
    const result = await exec(tools.write_case_file, { path: '/etc/passwd', content: 'x' })
    expect(result).toEqual({ error: expect.stringContaining('relative') })
  })

  it('rejects path traversal', async () => {
    const result = await exec(tools.write_case_file, { path: '../escaped', content: 'x' })
    expect(result).toMatchObject({ error: expect.stringMatching(/escapes|relative/i) })
    expect(fs.existsSync(path.join(path.dirname(tmpDir), 'escaped'))).toBe(false)
  })
})

describe('read_case_file', () => {
  it('reads a previously written file', async () => {
    fs.writeFileSync(path.join(tmpDir, 'foo.txt'), 'hello')
    const result = await exec(tools.read_case_file, { path: 'foo.txt' })
    expect(result).toEqual({ path: 'foo.txt', content: 'hello' })
  })

  it('returns an error object when the file does not exist', async () => {
    const result = await exec(tools.read_case_file, { path: 'missing.txt' })
    expect(result).toEqual({ error: expect.stringContaining('does not exist') })
  })
})

describe('list_case_files', () => {
  it('lists files under caseDir recursively, sorted', async () => {
    fs.mkdirSync(path.join(tmpDir, 'system'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'system/controlDict'), '')
    fs.mkdirSync(path.join(tmpDir, '0'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, '0/U'), '')

    const result = (await exec(tools.list_case_files, {})) as { files: string[] }
    expect(result.files).toEqual(['0/U', 'system/controlDict'])
  })

  it('returns empty list when caseDir is empty', async () => {
    const result = (await exec(tools.list_case_files, {})) as { files: string[] }
    expect(result.files).toEqual([])
  })
})

describe('edit_case_file', () => {
  beforeEach(() => {
    fs.writeFileSync(path.join(tmpDir, 'fvSchemes'), 'ddtSchemes\n{\n  default Euler;\n}\n')
  })

  it('replaces unique text', async () => {
    const result = await exec(tools.edit_case_file, {
      path: 'fvSchemes',
      oldText: 'default Euler;',
      newText: 'default backward;',
    })
    const updated = fs.readFileSync(path.join(tmpDir, 'fvSchemes'), 'utf8')
    expect(updated).toContain('default backward;')
    expect(updated).not.toContain('default Euler;')
    expect(result).toMatchObject({ path: 'fvSchemes' })
  })

  it('errors when oldText not found', async () => {
    const result = await exec(tools.edit_case_file, {
      path: 'fvSchemes',
      oldText: 'this string does not exist',
      newText: 'foo',
    })
    expect(result).toEqual({ error: expect.stringContaining('not found') })
  })

  it('errors when oldText is not unique', async () => {
    fs.writeFileSync(path.join(tmpDir, 'dupe'), 'a\na\n')
    const result = await exec(tools.edit_case_file, {
      path: 'dupe',
      oldText: 'a',
      newText: 'b',
    })
    expect(result).toEqual({ error: expect.stringContaining('not unique') })
  })
})

describe('finish', () => {
  it('emits a finish event and calls onFinish', async () => {
    fs.writeFileSync(path.join(tmpDir, 'system-control-placeholder'), 'ok')
    let captured: string | null = null
    const t = makeTools({
      caseDir: tmpDir,
      docker: null,
      onEvent: (e) => events.push(e),
      onFinish: (s) => { captured = s },
    })
    await exec(t.finish, { summary: 'all good' })
    expect(captured).toBe('all good')
    expect(events.find((e) => e.type === 'finish')).toMatchObject({
      type: 'finish',
      summary: 'all good',
    })
  })
})

describe('run_command', () => {
  it('errors when docker is not provided', async () => {
    fs.mkdirSync(path.join(tmpDir, 'system'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'system/blockMeshDict'), '')
    const result = await exec(tools.run_command, { cmd: 'blockMesh' })
    expect(result).toEqual({ error: expect.stringContaining('Docker') })
  })
})

describe('event tracing', () => {
  it('emits tool-call and tool-result around every execute', async () => {
    await exec(tools.write_case_file, { path: 'a', content: 'x' })
    const calls = events.filter((e) => e.type === 'tool-call')
    const results = events.filter((e) => e.type === 'tool-result')
    expect(calls.length).toBe(1)
    expect(results.length).toBe(1)
    expect(calls[0]).toMatchObject({ tool: 'write_case_file' })
    expect(results[0]).toMatchObject({ tool: 'write_case_file', ok: true })
  })

  it('marks tool-result ok=false on validation failure', async () => {
    await exec(tools.write_case_file, { path: '/abs', content: '' })
    const result = events.find((e) => e.type === 'tool-result')
    expect(result).toMatchObject({ ok: false })
  })
})
