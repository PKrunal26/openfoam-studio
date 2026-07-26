/**
 * Reviewer — diagnoses OpenFOAM runtime errors and returns a corrected file.
 *
 * Uses the `claude` CLI (no API key required — uses Claude Code's auth).
 * Takes an error log and the current case files, returns which file to fix
 * and the corrected content.
 *
 * If it cannot confidently identify the error, it returns cannotIdentify=true
 * rather than guessing.
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { runClaude } from './claude-runner.js'
import { resolveAppRoot } from '../paths.js'
import type { CaseFiles } from './types.js'

export type { CaseFiles }

export interface ReviewResult {
  /** The relative filepath that needs fixing (e.g. "system/controlDict") */
  filename: string
  /** The complete corrected file content */
  correctedContent: string
  /** Brief diagnosis of the problem */
  diagnosis: string
}

export interface ReviewFailure {
  cannotIdentify: true
  diagnosis: string
}

export type ReviewerOutput = ReviewResult | ReviewFailure

// ---------------------------------------------------------------------------
// Wiki loading
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// resolveAppRoot, not '../..': this module can be inlined into
// demo/server.compiled.js, where fixed hops escape the app bundle.
const WIKI_PATH = path.join(resolveAppRoot(__dirname), 'wiki', 'errors', 'common-failures.md')

let _wikiContent: string | null = null
function getWikiContent(): string {
  if (_wikiContent !== null) return _wikiContent
  try {
    _wikiContent = fs.readFileSync(WIKI_PATH, 'utf-8')
    return _wikiContent
  } catch (err) {
    console.warn(`[Reviewer] Warning: wiki not found at ${WIKI_PATH}. RCA quality will be reduced.`)
    _wikiContent = '(Wiki not available — see wiki/errors/ for common failure patterns)'
    return _wikiContent
  }
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  const wiki = getWikiContent()
  return `\
You are an OpenFOAM 13 error diagnostic agent.

Your job: given an OpenFOAM error log and a set of case files, identify
which file contains the problem and return the corrected file content.

## Rules

1. Only identify errors you are CONFIDENT about. If uncertain, return cannotIdentify.
2. Return a single JSON object — no markdown, no explanation outside the JSON.
3. The corrected file content must be complete and valid OpenFOAM 13 syntax.
4. Do not change anything unrelated to the diagnosed error.

## Output format (success)

\`\`\`json
{
  "filename": "system/controlDict",
  "correctedContent": "/* full file content here */",
  "diagnosis": "deltaT was 1.0 which is too large; reduced to 0.005"
}
\`\`\`

## Output format (cannot identify)

\`\`\`json
{
  "cannotIdentify": true,
  "diagnosis": "Could not identify the root cause from the error log"
}
\`\`\`

## Common failure patterns (reference)

${wiki}
`
}

// ---------------------------------------------------------------------------
// User prompt builder
// ---------------------------------------------------------------------------

function buildUserPrompt(errorLog: string, files: CaseFiles): string {
  const fileListings = Object.entries(files)
    .map(([name, content]) => `\n### ${name}\n\`\`\`\n${content}\n\`\`\``)
    .join('\n')

  return [
    '## Error log',
    '```',
    errorLog.slice(-3000),  // keep last 3000 chars (most relevant part)
    '```',
    '',
    '## Current case files',
    fileListings,
    '',
    'Diagnose the error. Return JSON only.',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class Reviewer {
  /**
   * Diagnose an OpenFOAM error and return the corrected file.
   * @param errorLog  Full or truncated text from the solver/blockMesh log
   * @param files     All current case files (filepath → content)
   */
  async review(errorLog: string, files: CaseFiles): Promise<ReviewerOutput> {
    const systemPrompt = buildSystemPrompt()
    const userPrompt = buildUserPrompt(errorLog, files)

    console.log('  [Reviewer] Spawning claude CLI...')
    const raw = await runClaude(systemPrompt, userPrompt)

    // Parse claude CLI envelope
    let envelope: { is_error?: boolean; result?: string }
    try {
      envelope = JSON.parse(raw)
    } catch {
      throw new Error(`claude CLI returned non-JSON:\n${raw.slice(0, 500)}`)
    }

    if (envelope.is_error) {
      throw new Error(`claude CLI error: ${envelope.result}`)
    }

    if (!envelope.result) {
      throw new Error(`claude CLI returned empty result`)
    }

    // Strip markdown code fences if present
    let resultStr = envelope.result.trim()
    resultStr = resultStr
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim()

    // Parse the result JSON
    let result: Record<string, unknown>
    try {
      result = JSON.parse(resultStr)
    } catch {
      throw new Error(
        `Reviewer returned non-JSON result:\n${envelope.result.slice(0, 500)}`
      )
    }

    if (result['cannotIdentify'] === true) {
      return {
        cannotIdentify: true,
        diagnosis: String(result['diagnosis'] ?? 'Unknown'),
      }
    }

    if (!result['filename'] || !result['correctedContent']) {
      throw new Error(
        `Reviewer result missing required fields (filename/correctedContent):\n${resultStr.slice(0, 500)}`
      )
    }

    return {
      filename: String(result['filename']),
      correctedContent: String(result['correctedContent'])
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n'),
      diagnosis: String(result['diagnosis'] ?? ''),
    }
  }
}
