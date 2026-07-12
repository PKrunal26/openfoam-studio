import type { ReactNode } from 'react'

/**
 * Minimal markdown renderer for assistant messages.
 *
 * Deliberately dependency-free: builds React elements directly (never
 * dangerouslySetInnerHTML), so model output can't inject markup. Supports the
 * subset the agent actually produces — paragraphs, headings, bold/italic,
 * inline code, fenced code blocks, bullet/numbered lists, and links.
 */

const INLINE_RE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\((?:https?:\/\/)[^)\s]+\))/g

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let i = 0
  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0
    if (idx > last) nodes.push(text.slice(last, idx))
    const token = m[0]
    const key = `${keyBase}-${i++}`
    if (token.startsWith('`')) {
      nodes.push(
        <code key={key} className="rounded bg-muted/60 px-1 py-px font-mono text-[0.92em]">
          {token.slice(1, -1)}
        </code>,
      )
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('*')) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>)
    } else {
      const close = token.indexOf('](')
      const label = token.slice(1, close)
      const href = token.slice(close + 2, -1)
      nodes.push(
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="underline decoration-muted-foreground/60 underline-offset-2 hover:decoration-foreground"
        >
          {label}
        </a>,
      )
    }
    last = idx + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

interface Block {
  kind: 'p' | 'h' | 'ul' | 'ol' | 'code'
  level?: number
  lines: string[]
}

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let current: Block | null = null
  let inFence = false

  const close = () => {
    if (current && current.lines.length > 0) blocks.push(current)
    current = null
  }

  for (const raw of lines) {
    if (raw.trimStart().startsWith('```')) {
      if (inFence) {
        inFence = false
        close()
      } else {
        close()
        inFence = true
        current = { kind: 'code', lines: [] }
      }
      continue
    }
    if (inFence) {
      current!.lines.push(raw)
      continue
    }

    const line = raw.trimEnd()
    if (!line.trim()) {
      close()
      continue
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      close()
      blocks.push({ kind: 'h', level: heading[1].length, lines: [heading[2]] })
      continue
    }

    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line)
    if (bullet) {
      if (current?.kind !== 'ul') { close(); current = { kind: 'ul', lines: [] } }
      current.lines.push(bullet[1])
      continue
    }

    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (numbered) {
      if (current?.kind !== 'ol') { close(); current = { kind: 'ol', lines: [] } }
      current.lines.push(numbered[1])
      continue
    }

    if (current?.kind !== 'p') { close(); current = { kind: 'p', lines: [] } }
    current.lines.push(line.trim())
  }
  close()
  return blocks
}

export function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text)
  return (
    <div className="grid gap-1.5">
      {blocks.map((b, i) => {
        if (b.kind === 'code') {
          return (
            <pre
              key={i}
              className="overflow-x-auto rounded-md bg-muted/50 px-2.5 py-2 font-mono text-[11px] leading-relaxed"
            >
              {b.lines.join('\n')}
            </pre>
          )
        }
        if (b.kind === 'h') {
          return (
            <p key={i} className="mt-1 font-semibold text-foreground">
              {renderInline(b.lines[0] ?? '', `h${i}`)}
            </p>
          )
        }
        if (b.kind === 'ul' || b.kind === 'ol') {
          const List = b.kind === 'ul' ? 'ul' : 'ol'
          return (
            <List
              key={i}
              className={
                b.kind === 'ul'
                  ? 'ml-4 list-disc space-y-0.5 marker:text-muted-foreground'
                  : 'ml-4 list-decimal space-y-0.5 marker:text-muted-foreground'
              }
            >
              {b.lines.map((item, j) => (
                <li key={j}>{renderInline(item, `${i}-${j}`)}</li>
              ))}
            </List>
          )
        }
        return <p key={i}>{renderInline(b.lines.join(' '), `p${i}`)}</p>
      })}
    </div>
  )
}
