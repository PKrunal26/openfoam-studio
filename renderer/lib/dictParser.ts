// Minimal OpenFOAM dictionary parser.
//
// Extracts top-level scalar entries of the form
//   key   value;
//   key   value [units];
// while skipping comments, the FoamFile header block, and any nested
// sub-dictionary. Designed for round-tripping: setValue() rewrites the
// value token in place and preserves surrounding whitespace and units.

export interface DictEntry {
  key: string
  value: string
  units?: string
  line: number
}

export interface ParsedDict {
  entries: DictEntry[]
}

const ENTRY_RE = /^([a-zA-Z][a-zA-Z0-9_.]*)\s+([^;{]+);\s*(?:\/\/.*)?$/

function stripLineComment(line: string): string {
  // Strip // comments outside of strings. OpenFOAM dicts rarely use strings
  // so a naive split is fine here.
  const idx = line.indexOf('//')
  return idx >= 0 ? line.slice(0, idx) : line
}

function stripBlockComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
}

export function parseDict(text: string): ParsedDict {
  const cleaned = stripBlockComments(text)
  const lines = cleaned.split(/\r?\n/)
  const entries: DictEntry[] = []
  let depth = 0
  let inFoamFile = false
  let foamFileDepth = 0

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = stripLineComment(raw).trim()
    if (!line) continue

    // Track brace depth across the whole document. Counting per-line is
    // good enough for well-formed dicts.
    const opens = (line.match(/\{/g) ?? []).length
    const closes = (line.match(/\}/g) ?? []).length

    // FoamFile header — skip its body entirely.
    if (depth === 0 && /^FoamFile\b/.test(line)) {
      inFoamFile = true
      foamFileDepth = depth + opens - closes
      depth += opens - closes
      continue
    }
    if (inFoamFile) {
      depth += opens - closes
      if (depth <= foamFileDepth - 1 || depth === 0) {
        inFoamFile = false
      }
      continue
    }

    // Only collect top-level entries.
    if (depth === 0 && opens === 0 && closes === 0) {
      const m = ENTRY_RE.exec(line)
      if (m) {
        const key = m[1]
        let rest = m[2].trim()
        let units: string | undefined
        const unitsMatch = /^(.*?)\s*(\[[^\]]+\])\s*$/.exec(rest)
        if (unitsMatch) {
          rest = unitsMatch[1].trim()
          units = unitsMatch[2]
        }
        // Skip multi-token values that aren't a units annotation — they
        // are typically dimension-set entries (e.g. `nu nu [0 2 -1 ...] 0`)
        // or vector lists which we cannot edit safely as a single field.
        if (!/\s/.test(rest)) {
          entries.push({ key, value: rest, units, line: i })
        }
      }
    }

    depth += opens - closes
    if (depth < 0) depth = 0
  }

  return { entries }
}

// Replace the value token for `key` on its top-level entry. Preserves the
// original whitespace, trailing semicolon, and units annotation. Returns
// the original text unchanged if the key cannot be found.
export function setValue(text: string, key: string, newValue: string): string {
  const lines = text.split(/\r?\n/)
  const parsed = parseDict(text)
  const entry = parsed.entries.find((e) => e.key === key)
  if (!entry) return text

  const original = lines[entry.line]
  // Match: <indent><key><gap><value>[<gap2><units>]<;>...
  const re = new RegExp(
    `^(\\s*${escapeRegex(key)}\\s+)([^;\\[]+?)(\\s*\\[[^\\]]+\\])?(\\s*;)`,
  )
  const replaced = original.replace(re, (_m, prefix, _val, units, semi) => {
    return `${prefix}${newValue}${units ?? ''}${semi}`
  })
  if (replaced === original) return text
  lines[entry.line] = replaced
  return lines.join('\n')
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
