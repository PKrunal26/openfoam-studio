/**
 * FileGenerator — generates OpenFOAM 13 case files from a plain English prompt.
 *
 * Dispatches through `generateWithLLM`, which honours the user's BYOK
 * provider choice (Claude CLI, Anthropic, OpenAI, Google, or any
 * OpenAI-compatible endpoint). Returns Record<filepath, content> with LF endings.
 */

import { CAVITY_SYSTEM_PROMPT } from './prompts/cavity-system-prompt.js'
import { generateWithLLM } from './llm.js'
import type { CaseFiles, Message } from './types.js'

export type { CaseFiles }

// ---------------------------------------------------------------------------
// Required files for a complete cavity case
// ---------------------------------------------------------------------------

const REQUIRED_FILE_KEYS = [
  '0/U',
  '0/p',
  'constant/physicalProperties',
  'constant/momentumTransport',
  'system/controlDict',
  'system/fvSchemes',
  'system/fvSolution',
  'system/blockMeshDict',
] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the user prompt for the first turn (no history). */
function buildFirstTurnPrompt(request: string): string {
  return [
    `Generate all OpenFOAM 13 case files for the following simulation:`,
    ``,
    `  ${request}`,
    ``,
    `Output ONLY a raw JSON object (no markdown, no code fences, no explanation).`,
    `The object must have exactly these keys:`,
    REQUIRED_FILE_KEYS.map(k => `  "${k}"`).join(',\n'),
    ``,
    `Each value is the complete file content as a string, with LF line endings.`,
  ].join('\n')
}

/** Build the user prompt for a refinement turn (history provided). */
function buildRefinementPrompt(request: string, history: Message[]): string {
  const historyText = history
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n')

  return [
    `Previous conversation:`,
    `---`,
    historyText,
    `---`,
    ``,
    `Refinement request: ${request}`,
    ``,
    `Output ONLY a raw JSON object (no markdown, no code fences, no explanation).`,
    `Include ONLY the files that need to change. Omit all unchanged files.`,
    `If nothing needs to change, return {}.`,
    `Each value is the complete file content as a string, with LF line endings.`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// FileGenerator
// ---------------------------------------------------------------------------

export class FileGenerator {
  /**
   * Generate all 8 required OpenFOAM case files for the given prompt.
   * Returns Record<filepath, content> with LF-normalised content.
   *
   * @param onProgress - optional callback called as Claude streams output.
   *   Receives a human-readable message like "Writing system/blockMeshDict…"
   *   when a new file key is detected in the stream, or a raw text delta for
   *   generic progress ticks.
   */
  async generate(
    prompt: string,
    onProgress?: (msg: string) => void,
    history?: Message[],
  ): Promise<CaseFiles> {
    const isRefinement = history !== undefined && history.length > 0
    const userPrompt = isRefinement
      ? buildRefinementPrompt(prompt, history)
      : buildFirstTurnPrompt(prompt)

    // Track which file keys have already been announced so we don't repeat.
    const announced = new Set<string>()

    const onText = onProgress
      ? (delta: string) => {
          // Detect JSON keys as they stream in: "0/U": or "system/blockMeshDict":
          const keyPattern = /"((?:0|constant|system)\/[^"]+)"[ \t]*:/g
          let m: RegExpExecArray | null
          while ((m = keyPattern.exec(delta)) !== null) {
            const key = m[1]!
            if (!announced.has(key)) {
              announced.add(key)
              onProgress(`Writing ${key}…`)
            }
          }
        }
      : undefined

    const { text: resultText, provider, model } = await generateWithLLM(
      CAVITY_SYSTEM_PROMPT,
      userPrompt,
      { ...(onText ? { onDelta: onText } : {}), maxOutputTokens: 16384 },
    )
    console.log(`  [FileGenerator] Using ${provider} / ${model}`)

    if (!resultText) {
      throw new Error(`LLM returned empty result.`)
    }

    // The result string should be a JSON object of filepath → content
    let files: Record<string, unknown>
    try {
      files = JSON.parse(resultText)
    } catch {
      // Some models wrap in a code fence despite instructions — strip it
      const stripped = resultText
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim()
      try {
        files = JSON.parse(stripped)
      } catch {
        throw new Error(
          `Could not parse file JSON from LLM result:\n${resultText.slice(0, 800)}`
        )
      }
    }

    // On first turn, validate all required keys are present.
    // On refinement turns, Claude returns only the changed files — that's expected.
    if (!isRefinement) {
      const missing = REQUIRED_FILE_KEYS.filter(k => !(k in files))
      if (missing.length > 0) {
        throw new Error(`Generated output is missing required files: ${missing.join(', ')}`)
      }
    }

    // Normalise: enforce LF line endings, assert string values
    const normalised: CaseFiles = {}
    for (const [filePath, content] of Object.entries(files)) {
      if (typeof content !== 'string') {
        throw new Error(`File "${filePath}" content is not a string (got ${typeof content})`)
      }
      // Normalise path separators and line endings
      const key = filePath.replace(/\\/g, '/')
      normalised[key] = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    }

    console.log(`  [FileGenerator] Generated ${Object.keys(normalised).length} files`)
    return normalised
  }

  /**
   * Generate each required file in a separate LLM call.
   * Designed for local models (LM Studio, Ollama) that cannot produce 8 files
   * in a single JSON blob without truncating. Each call asks for one raw file
   * — no JSON wrapping — so output fits comfortably within small context windows.
   */
  async generateFileByFile(
    prompt: string,
    onProgress?: (msg: string) => void,
  ): Promise<CaseFiles> {
    const results: CaseFiles = {}

    for (const fileKey of REQUIRED_FILE_KEYS) {
      onProgress?.(`Writing ${fileKey}…`)

      const userPrompt = [
        `Generate the OpenFOAM 13 file \`${fileKey}\` for the following simulation:`,
        ``,
        `  ${prompt}`,
        ``,
        `Output ONLY the raw file content — no JSON, no code fences, no explanation.`,
        `Start directly with the FoamFile header (/*--- C++ ---*/ line).`,
      ].join('\n')

      const { text } = await generateWithLLM(CAVITY_SYSTEM_PROMPT, userPrompt, {
        maxOutputTokens: 2048,
      })

      if (!text.trim()) {
        throw new Error(`Local model returned empty content for ${fileKey}`)
      }

      // Strip accidental code fences some models add despite instructions
      const cleaned = text
        .replace(/^```[^\n]*\n?/m, '')
        .replace(/\n?```\s*$/, '')
        .trim()

      results[fileKey] = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    }

    console.log(`  [FileGenerator] generateFileByFile: ${Object.keys(results).length} files`)
    return results
  }
}
