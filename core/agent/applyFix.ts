/**
 * applyFix — apply a FileFix[] to a case directory.
 *
 * Extracted from the apply-fix HTTP handler so the mutation logic is
 * unit-testable without a running server or Docker. The handler in
 * demo/server.ts is a thin wrapper around applyFixes().
 *
 * Fix conventions (oldValue acts as the discriminator):
 *  - ''            → CREATE: write newValue as the file's full content
 *                    (authors a missing dictionary, e.g. constant/phaseProperties).
 *  - 'HALVE_DELTA_T' → find deltaT and halve it (existing file).
 *  - 'ADD_UFINAL'    → insert a UFinal solver block (existing file).
 *  - otherwise      → substring/whitespace-tolerant replace (existing file).
 *
 * All writes use LF line endings per the project's hard rule.
 */
import fs from 'fs'
import path from 'path'
import type { FileFix } from './ErrorRecovery.js'

export type ApplyResult =
  | { ok: true }
  | { ok: false; status: number; message: string }

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const toLF = (s: string) => s.replace(/\r\n/g, '\n')

export function applyFixes(caseDir: string, fixes: FileFix[]): ApplyResult {
  for (const fix of fixes) {
    const resolved = path.resolve(caseDir, fix.file)
    const rel = path.relative(caseDir, resolved)
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      return { ok: false, status: 400, message: `Bad file path: ${fix.file}` }
    }

    // CREATE: empty oldValue means author the whole file from newValue. This is
    // what the LLM diagnoser emits for a file that is entirely absent (the diff
    // shows only additions). Substring-replace can't author a brand-new file,
    // and the old handler 404'd here — that was the bug.
    if (fix.oldValue === '') {
      fs.mkdirSync(path.dirname(resolved), { recursive: true })
      fs.writeFileSync(resolved, toLF(fix.newValue), 'utf8')
      continue
    }

    if (!fs.existsSync(resolved)) {
      return { ok: false, status: 404, message: `File not found: ${fix.file}` }
    }

    let content = fs.readFileSync(resolved, 'utf8')

    if (fix.oldValue === 'HALVE_DELTA_T') {
      // Special sentinel: find deltaT and halve it
      content = content.replace(/(deltaT\s+)([\d.eE+-]+)(;)/, (_match, key, val, semi) => {
        const halved = (parseFloat(val) / 2).toPrecision(4)
        return `${key}${halved}${semi}`
      })
    } else if (fix.oldValue === 'ADD_UFINAL') {
      // Special sentinel: insert UFinal block before closing brace of solvers (before PIMPLE)
      content = content.replace(
        /\n(\})\s*(PIMPLE\b)/,
        '\n    UFinal\n    {\n        $U;\n        relTol          0;\n    }\n}\n\n$2'
      )
    } else {
      const exact = content.split(fix.oldValue).join(fix.newValue)
      if (exact !== content) {
        content = exact
      } else {
        // OpenFOAM dict whitespace varies (the generator may use tabs, a
        // different indent, or `SIMPLE {` on one line), so an exact-substring
        // match can silently miss and waste a retry. Retry with a
        // whitespace-tolerant regex; if it still doesn't match, fail loudly.
        const pattern = escapeRegExp(fix.oldValue).replace(/\s+/g, '\\s+')
        const re = new RegExp(pattern)
        if (!re.test(content)) {
          return {
            ok: false,
            status: 422,
            message: `Fix could not be applied: pattern not found in ${fix.file}`,
          }
        }
        content = content.replace(re, () => fix.newValue)
      }
    }

    fs.writeFileSync(resolved, toLF(content), 'utf8')
  }

  return { ok: true }
}
