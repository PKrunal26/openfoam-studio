/**
 * DocsIndex sanity tests — runs against the real wiki/ directory committed in
 * the repo. We don't rely on the OpenFOAM v13 doc cache being scraped (it's an
 * optional opt-in via `npm run scrape:docs`), so all assertions touch wiki/*.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { getDocsIndex, _resetDocsIndex } from '../../../core/agent/DocsIndex.js'

beforeEach(() => {
  _resetDocsIndex()
})

describe('DocsIndex', () => {
  it('builds a non-empty index from the repo wiki', () => {
    const idx = getDocsIndex()
    expect(idx.size()).toBeGreaterThan(0)
  })

  it('caches the handle across calls', () => {
    const a = getDocsIndex()
    const b = getDocsIndex()
    expect(a).toBe(b)
  })

  it('returns hits for a wiki keyword', () => {
    const idx = getDocsIndex()
    const hits = idx.search('blockMesh', 5)
    expect(hits.length).toBeGreaterThan(0)
    for (const h of hits) {
      expect(['docs', 'wiki']).toContain(h.source)
      expect(h.path).toMatch(/^(docs|wiki)\//)
    }
  })

  it('returns empty for an empty query', () => {
    const idx = getDocsIndex()
    expect(idx.search('   ')).toEqual([])
  })

  it('read() returns content for a known wiki path', () => {
    const idx = getDocsIndex()
    const content = idx.read('wiki/openfoam-13-agent-guide.md')
    expect(content).toBeTruthy()
    expect(typeof content).toBe('string')
  })

  it('read() refuses paths outside docs/wiki dirs', () => {
    const idx = getDocsIndex()
    expect(idx.read('/etc/passwd')).toBeNull()
    expect(idx.read('package.json')).toBeNull()
    expect(idx.read('../../etc/passwd')).toBeNull()
  })
})
