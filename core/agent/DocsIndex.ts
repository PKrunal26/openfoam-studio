/**
 * DocsIndex — ranked keyword search over the OpenFOAM 13 doc cache and the
 * project wiki. No vector DB; the corpus is small and the agent does much
 * better with citation-style hits than dense retrieval here.
 *
 * Scans:
 *   - docs/openfoam-v13/**\/*.md   (output of scripts/scrape-openfoam-docs.ts)
 *   - wiki/**\/*.md
 *
 * Splits each file into chunks at H2/H3 boundaries, indexes title + heading +
 * body. Returns ranked hits with the source path so the agent can call
 * `read_doc` on the full file when it wants more context.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import FlexSearch from 'flexsearch'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')
const DOCS_DIR = path.join(REPO_ROOT, 'docs', 'openfoam-v13')
const WIKI_DIR = path.join(REPO_ROOT, 'wiki')

export interface DocChunk {
  id: number
  source: 'docs' | 'wiki'
  /** Path relative to repo root, e.g. "wiki/cases/lid-driven-cavity.md" */
  path: string
  /** Heading hierarchy joined with " › " */
  heading: string
  /** First ~600 chars of the chunk body */
  preview: string
  /** Full body of the chunk */
  body: string
}

export interface DocsIndexHandle {
  search: (query: string, k?: number) => DocChunk[]
  read: (relPath: string) => string | null
  size: () => number
}

function* walkMd(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walkMd(full)
    else if (entry.isFile() && entry.name.endsWith('.md')) yield full
  }
}

/**
 * Split a markdown document at H1/H2/H3 boundaries. Each chunk carries the
 * heading hierarchy from the start of the file down to the boundary.
 */
function splitChunks(markdown: string): { heading: string; body: string }[] {
  const lines = markdown.split('\n')
  const chunks: { heading: string; body: string }[] = []
  let currentH1 = ''
  let currentH2 = ''
  let currentH3 = ''
  let buf: string[] = []

  const flush = () => {
    const body = buf.join('\n').trim()
    if (!body) return
    const heading = [currentH1, currentH2, currentH3].filter(Boolean).join(' › ') || '(intro)'
    chunks.push({ heading, body })
    buf = []
  }

  for (const line of lines) {
    const m1 = /^# (.+)$/.exec(line)
    const m2 = /^## (.+)$/.exec(line)
    const m3 = /^### (.+)$/.exec(line)
    if (m1) { flush(); currentH1 = m1[1]!.trim(); currentH2 = ''; currentH3 = ''; continue }
    if (m2) { flush(); currentH2 = m2[1]!.trim(); currentH3 = ''; continue }
    if (m3) { flush(); currentH3 = m3[1]!.trim(); continue }
    buf.push(line)
  }
  flush()
  return chunks
}

let _handle: DocsIndexHandle | null = null

/**
 * Build (or return cached) the docs index. Idempotent — safe to call from
 * multiple tool invocations in the same process.
 */
export function getDocsIndex(): DocsIndexHandle {
  if (_handle) return _handle

  const chunks: DocChunk[] = []
  let nextId = 1

  for (const [dir, source] of [
    [DOCS_DIR, 'docs' as const],
    [WIKI_DIR, 'wiki' as const],
  ] as const) {
    for (const fullPath of walkMd(dir)) {
      const md = fs.readFileSync(fullPath, 'utf8')
      const rel = path.relative(REPO_ROOT, fullPath)
      for (const c of splitChunks(md)) {
        chunks.push({
          id: nextId++,
          source,
          path: rel,
          heading: c.heading,
          preview: c.body.slice(0, 600),
          body: c.body,
        })
      }
    }
  }

  // FlexSearch typings differ between versions; cast to any for the constructor.
  const ctor = (FlexSearch as unknown as { Document: new (opts: unknown) => unknown }).Document
  const index = new ctor({
    document: {
      id: 'id',
      index: ['heading', 'body', 'path'],
    },
    tokenize: 'forward',
  }) as { add: (doc: DocChunk) => void; search: (q: string, opts?: unknown) => unknown[] }

  for (const c of chunks) index.add(c)

  const byId = new Map<number, DocChunk>()
  for (const c of chunks) byId.set(c.id, c)

  _handle = {
    search(query: string, k = 5): DocChunk[] {
      const trimmed = query.trim()
      if (!trimmed) return []
      const raw = index.search(trimmed, { limit: k * 3 }) as Array<{ result: number[] }>
      const seen = new Set<number>()
      const out: DocChunk[] = []
      for (const group of raw) {
        for (const id of group.result ?? []) {
          if (seen.has(id)) continue
          seen.add(id)
          const chunk = byId.get(id)
          if (chunk) out.push(chunk)
          if (out.length >= k) break
        }
        if (out.length >= k) break
      }
      return out
    },
    read(relPath: string): string | null {
      // Path-guard: must resolve under DOCS_DIR or WIKI_DIR.
      const abs = path.resolve(REPO_ROOT, relPath)
      if (!abs.startsWith(DOCS_DIR + path.sep) && !abs.startsWith(WIKI_DIR + path.sep)) {
        return null
      }
      try {
        return fs.readFileSync(abs, 'utf8')
      } catch {
        return null
      }
    },
    size(): number {
      return chunks.length
    },
  }
  return _handle
}

/** Reset the cached index — only used by tests. */
export function _resetDocsIndex() {
  _handle = null
}
