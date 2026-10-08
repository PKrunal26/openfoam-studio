/** Preflight the complete patch, stage LF files, then commit with rollback. */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { FileFix } from './ErrorRecovery.js'
import { assertSafeDictionary, safeCasePath } from '../run/casePolicy.js'

export type ApplyResult = { ok: true } | { ok: false; status: number; message: string }
export const FileFixSchema = z.object({
  file: z.string().min(1).max(512), description: z.string().min(1).max(4000),
  oldValue: z.string().max(8 * 1024 * 1024), newValue: z.string().max(8 * 1024 * 1024),
  expectedContent: z.string().max(8 * 1024 * 1024).optional(),
}).strict()
export const DiagnosisSchema = z.object({
  errorClass: z.string().min(1).max(200), description: z.string().min(1).max(16000),
  fix: z.array(FileFixSchema).max(50), assumptions: z.array(z.string().max(4000)).max(20).optional(),
}).strict()

const toLF = (value: string) => value.replace(/\r\n?/g, '\n')
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function applyOne(content: string, fix: FileFix): string {
  if (fix.oldValue === 'HALVE_DELTA_T') {
    const matches = [...content.matchAll(/\bdeltaT\s+([\d.eE+-]+)\s*;/g)]
    if (matches.length !== 1 || !Number.isFinite(Number(matches[0]![1])) || Number(matches[0]![1]) <= 0) throw new Error('deltaT must be uniquely defined and positive')
    return content.replace(matches[0]![0], `deltaT ${Number(matches[0]![1]) / 2};`)
  }
  if (fix.oldValue === 'ADD_UFINAL') {
    if (/\bUFinal\b/.test(content)) throw new Error('UFinal already exists')
    const matches = [...content.matchAll(/\bsolvers\s*\{/g)]
    if (matches.length !== 1 || !/\bU\s*\{/.test(content)) throw new Error('Cannot uniquely identify solvers and U block')
    const begin = matches[0]!.index! + matches[0]![0].length
    let depth = 1
    let end = begin
    for (; end < content.length && depth; end++) { if (content[end] === '{') depth++; if (content[end] === '}') depth-- }
    if (depth) throw new Error('Unbalanced solvers dictionary')
    return content.slice(0, end - 1) + '\n    UFinal\n    {\n        $U;\n        relTol 0;\n    }\n' + content.slice(end - 1)
  }
  let pattern = new RegExp(escapeRegExp(fix.oldValue), 'g')
  let matches = [...content.matchAll(pattern)]
  if (!matches.length) {
    pattern = new RegExp(escapeRegExp(fix.oldValue).replace(/\s+/g, '\\s+'), 'g')
    matches = [...content.matchAll(pattern)]
  }
  if (matches.length !== 1) throw new Error(`Expected one oldValue match in ${fix.file}, found ${matches.length}`)
  return content.replace(pattern, () => fix.newValue)
}

export function applyFixes(caseDir: string, fixes: FileFix[]): ApplyResult {
  const parsed = z.array(FileFixSchema).min(1).max(50).safeParse(fixes)
  if (!parsed.success) return { ok: false, status: 400, message: 'Invalid or empty patch schema' }
  const plan = new Map<string, { original: string | null; updated: string; staged?: string }>()
  const committed: string[] = []
  try {
    // No file writes until every fix's path, expected contents, and match are valid.
    for (const fix of parsed.data) {
      let absolute: string
      try { absolute = safeCasePath(caseDir, fix.file) } catch (error) {
        return { ok: false, status: 400, message: error instanceof Error ? error.message : String(error) }
      }
      let entry = plan.get(absolute)
      if (!entry) {
        let original: string | null = null
        if (fs.existsSync(absolute)) {
          if (!fs.statSync(absolute).isFile()) return { ok: false, status: 400, message: `Not a regular file: ${fix.file}` }
          original = fs.readFileSync(absolute, 'utf8')
        }
        entry = { original, updated: original ?? '' }
        plan.set(absolute, entry)
      }
      if (fix.expectedContent !== undefined && fix.expectedContent !== entry.original) return { ok: false, status: 409, message: `File changed since diagnosis: ${fix.file}` }
      if (fix.oldValue === '') {
        if (entry.original !== null || entry.updated !== '') return { ok: false, status: 409, message: `Create would overwrite existing file: ${fix.file}` }
        if (!fix.newValue) throw new Error('Created file cannot be empty')
        entry.updated = toLF(fix.newValue)
      } else {
        if (entry.original === null) return { ok: false, status: 404, message: `File not found: ${fix.file}` }
        const updated = toLF(applyOne(entry.updated, fix))
        if (updated === entry.updated) throw new Error(`Patch makes no change: ${fix.file}`)
        entry.updated = updated
      }
      assertSafeDictionary(entry.updated, fix.file)
    }
    for (const [absolute, entry] of plan) {
      fs.mkdirSync(path.dirname(absolute), { recursive: true })
      entry.staged = path.join(path.dirname(absolute), `.ofs-patch-${randomUUID()}`)
      fs.writeFileSync(entry.staged, entry.updated, { encoding: 'utf8', flag: 'wx' })
    }
    for (const [absolute, entry] of plan) {
      // Check the originals again immediately before committing staged files.
      const current = fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null
      if (current !== entry.original) throw new Error(`File changed during patch: ${path.relative(caseDir, absolute)}`)
    }
    for (const [absolute, entry] of plan) { fs.renameSync(entry.staged!, absolute); committed.push(absolute) }
    return { ok: true }
  } catch (error) {
    let rollbackFailed = false
    for (const absolute of committed.reverse()) {
      try {
        const original = plan.get(absolute)!.original
        if (original === null) fs.rmSync(absolute, { force: true })
        else {
          const backup = path.join(path.dirname(absolute), `.ofs-rollback-${randomUUID()}`)
          fs.writeFileSync(backup, original, 'utf8'); fs.renameSync(backup, absolute)
        }
      } catch { rollbackFailed = true }
    }
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, status: rollbackFailed ? 500 : 422, message: `${message}${rollbackFailed ? '; rollback failed: inspect the case before running' : ''}` }
  } finally {
    for (const entry of plan.values()) if (entry.staged) { try { fs.rmSync(entry.staged, { force: true }) } catch { /* report original failure */ } }
  }
}
