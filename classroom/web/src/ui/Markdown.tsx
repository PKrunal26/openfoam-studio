import type { ReactNode } from 'react'

// Small, dependency-free markdown renderer for tutorial guides. Builds React
// elements directly (no innerHTML), supporting the subset the guides use.

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g

function inline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let index = 0
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0
    if (start > last) nodes.push(text.slice(last, start))
    const token = match[0]
    const key = `${keyBase}-${index++}`
    if (token.startsWith('`')) nodes.push(<code key={key}>{token.slice(1, -1)}</code>)
    else if (token.startsWith('**')) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith('*')) nodes.push(<em key={key}>{token.slice(1, -1)}</em>)
    else {
      const split = token.indexOf('](')
      nodes.push(<a key={key} href={token.slice(split + 2, -1)} target="_blank" rel="noreferrer noopener" className="font-medium text-primary-ink underline underline-offset-2">{token.slice(1, split)}</a>)
    }
    last = start + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

type Block = { kind: 'p' | 'h' | 'ul' | 'ol' | 'code' | 'quote'; lines: string[] }

function parse(source: string): Block[] {
  const blocks: Block[] = []
  let current: Block | null = null
  let fenced = false
  const close = () => { if (current && current.lines.length) blocks.push(current); current = null }
  for (const raw of source.split('\n')) {
    if (raw.trimStart().startsWith('```')) {
      if (fenced) { fenced = false; close() } else { close(); fenced = true; current = { kind: 'code', lines: [] } }
      continue
    }
    if (fenced) { current!.lines.push(raw); continue }
    const line = raw.trimEnd()
    if (!line.trim()) { close(); continue }
    const heading = /^#{3,4}\s+(.*)$/.exec(line)
    if (heading) { close(); blocks.push({ kind: 'h', lines: [heading[1]!] }); continue }
    const quote = /^>\s?(.*)$/.exec(line)
    if (quote) { if (current?.kind !== 'quote') { close(); current = { kind: 'quote', lines: [] } } current.lines.push(quote[1]!); continue }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    if (bullet) { if (current?.kind !== 'ul') { close(); current = { kind: 'ul', lines: [] } } current.lines.push(bullet[1]!); continue }
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (numbered) { if (current?.kind !== 'ol') { close(); current = { kind: 'ol', lines: [] } } current.lines.push(numbered[1]!); continue }
    if (current && (current.kind === 'ul' || current.kind === 'ol') && /^\s{2,}\S/.test(raw)) {
      current.lines[current.lines.length - 1] += ` ${line.trim()}`
      continue
    }
    if (current?.kind !== 'p') { close(); current = { kind: 'p', lines: [] } }
    current.lines.push(line.trim())
  }
  close()
  return blocks
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-guide">
      {parse(text).map((block, i) => {
        if (block.kind === 'code') return <pre key={i}>{block.lines.join('\n')}</pre>
        if (block.kind === 'h') return <h3 key={i}>{inline(block.lines[0]!, `h${i}`)}</h3>
        if (block.kind === 'quote') return <blockquote key={i}><p>{inline(block.lines.join(' '), `q${i}`)}</p></blockquote>
        if (block.kind === 'ul') return <ul key={i}>{block.lines.map((item, j) => <li key={j}>{inline(item, `${i}-${j}`)}</li>)}</ul>
        if (block.kind === 'ol') return <ol key={i}>{block.lines.map((item, j) => <li key={j}>{inline(item, `${i}-${j}`)}</li>)}</ol>
        return <p key={i}>{inline(block.lines.join(' '), `p${i}`)}</p>
      })}
    </div>
  )
}

/** Split a guide into steps at its `## ` headings. Text before the first heading is the intro. */
export function splitGuide(guide: string): { title: string; body: string }[] {
  const steps: { title: string; body: string }[] = []
  let current: { title: string; lines: string[] } | null = null
  let fenced = false
  for (const line of guide.split('\n')) {
    if (line.trimStart().startsWith('```')) fenced = !fenced
    const heading = !fenced ? /^##\s+(.*)$/.exec(line) : null
    if (heading) {
      if (current && (current.title || current.lines.join('').trim())) steps.push({ title: current.title, body: current.lines.join('\n') })
      current = { title: heading[1]!.trim(), lines: [] }
    } else {
      if (!current) current = { title: '', lines: [] }
      if (!/^#\s+/.test(line)) current.lines.push(line)
    }
  }
  if (current && (current.title || current.lines.join('').trim())) steps.push({ title: current.title, body: current.lines.join('\n') })
  return steps.map((step, index) => ({ title: step.title || (index === 0 ? 'Overview' : `Step ${index + 1}`), body: step.body }))
}
