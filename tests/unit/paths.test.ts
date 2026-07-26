/**
 * App-root resolution tests.
 *
 * The packaged app inlines core/** into demo/server.compiled.js, so any module
 * that reached the repo root with a fixed number of '..' hops lands outside the
 * app bundle once bundled. resolveAppRoot() must find the root in both layouts.
 */

import { describe, it, expect, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { resolveAppRoot } from '../../core/paths.js'

const madeDirs: string[] = []

function makeTree(spec: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ofs-approot-'))
  madeDirs.push(root)
  for (const [rel, contents] of Object.entries(spec)) {
    const full = path.join(root, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, contents)
  }
  return root
}

afterEach(() => {
  delete process.env['OFS_APP_ROOT']
  while (madeDirs.length) {
    const dir = madeDirs.pop()!
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('resolveAppRoot', () => {
  it('finds the root from a dev source layout (core/agent → repo root)', () => {
    const root = makeTree({
      'package.json': '{"name":"openfoam-studio"}',
      'wiki/errors/common-failures.md': '# failures',
      'core/agent/DocsIndex.ts': '// source',
    })
    expect(resolveAppRoot(path.join(root, 'core', 'agent'))).toBe(root)
  })

  it('finds the root from a packaged layout (demo/ → app root)', () => {
    // What the bundled server sees: <app>/demo/server.compiled.js
    const root = makeTree({
      'package.json': '{"name":"openfoam-studio"}',
      'wiki/errors/common-failures.md': '# failures',
      'demo/server.compiled.js': '// bundle',
    })
    expect(resolveAppRoot(path.join(root, 'demo'))).toBe(root)
  })

  it('returns the start dir when no package.json exists above it', () => {
    const root = makeTree({ 'nested/leaf/file.txt': 'x' })
    const start = path.join(root, 'nested', 'leaf')
    // tmpdir has no package.json above it, so there is nothing to find.
    expect(resolveAppRoot(start)).toBe(start)
  })

  it('honours the OFS_APP_ROOT override', () => {
    const root = makeTree({ 'package.json': '{}' })
    const override = makeTree({ 'package.json': '{}', 'wiki/x.md': '# x' })
    process.env['OFS_APP_ROOT'] = override
    expect(resolveAppRoot(path.join(root, 'demo'))).toBe(override)
  })

  it('ignores an OFS_APP_ROOT that does not exist', () => {
    const root = makeTree({ 'package.json': '{}', 'demo/server.compiled.js': '// b' })
    process.env['OFS_APP_ROOT'] = path.join(root, 'no', 'such', 'dir')
    expect(resolveAppRoot(path.join(root, 'demo'))).toBe(root)
  })
})
