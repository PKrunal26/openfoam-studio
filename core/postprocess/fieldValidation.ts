import fs from 'node:fs'
import path from 'node:path'

export interface FieldValidation {
  ok: boolean
  time: number | null
  checkedFields: string[]
  issues: string[]
  /** Finite fields establish numerical sanity, never convergence or benchmark accuracy. */
  scope: 'finite-written-internal-fields'
}

/** Validate actual written ASCII fields at an advanced time, without inferring convergence. */
export function validateWrittenFields(caseDir: string, options: {
  startTime?: number; requiredFields?: string[]; time?: number
} = {}): FieldValidation {
  const issues: string[] = []
  const checkedFields: string[] = []
  let caseEntries: fs.Dirent[]
  try {
    if (fs.lstatSync(caseDir).isSymbolicLink()) throw new Error('linked case')
    caseEntries = fs.readdirSync(caseDir, { withFileTypes: true })
  } catch {
    return { ok: false, time: null, checkedFields, issues: ['Case output directory is missing or unreadable'], scope: 'finite-written-internal-fields' }
  }
  const times = caseEntries.filter(entry =>
    entry.isDirectory() && /^[\d]+(?:\.\d*)?(?:e[+-]?\d+)?$/i.test(entry.name) && Number.isFinite(Number(entry.name)))
    .map(entry => ({ name: entry.name, value: Number(entry.name) })).sort((a, b) => b.value - a.value)
  const selected = options.time === undefined ? times[0] : times.find(time => time.value === options.time)
  if (!selected || selected.value <= (options.startTime ?? 0)) {
    return { ok: false, time: selected?.value ?? null, checkedFields, issues: ['No written output time beyond the requested start time'], scope: 'finite-written-internal-fields' }
  }
  let initialFields: string[] = []
  try {
    const initial = path.join(caseDir, '0')
    if (fs.lstatSync(initial).isSymbolicLink()) throw new Error('linked initial fields')
    initialFields = fs.readdirSync(initial)
  } catch {
    if (!options.requiredFields) return { ok: false, time: selected.value, checkedFields, issues: ['Initial field directory is missing or unreadable; required fields cannot be established'], scope: 'finite-written-internal-fields' }
  }
  const required = options.requiredFields ?? ['U', initialFields.includes('p_rgh') ? 'p_rgh' : 'p',
    ...initialFields.filter(name => /^alpha\.[\w]+$/.test(name) || ['T', 'k', 'epsilon', 'omega', 'nut', 'nuTilda', 'alphat'].includes(name))]
  for (const name of required) {
    if (!/^[\w.]+$/.test(name)) { issues.push(`Invalid field name ${name}`); continue }
    const filename = path.join(caseDir, selected.name, name)
    let text: string
    try {
      const stat = fs.lstatSync(filename)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024 * 1024) throw new Error('not a bounded regular field')
      text = fs.readFileSync(filename, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    } catch { issues.push(`Missing or unreadable field ${name} at time ${selected.value}`); continue }
    if (/\bformat\s+binary\s*;/.test(text)) { issues.push(`Binary field ${name} requires an ASCII export for numerical verification`); continue }
    if (/\b(?:nan|inf|infinity)\b/i.test(text)) { issues.push(`Non-finite value in ${name}`); continue }
    const internal = /\binternalField\s+(uniform|nonuniform)\s+([^;]+);/s.exec(text)
    if (!internal) { issues.push(`Cannot parse internalField in ${name}`); continue }
    const vector = /\bclass\s+volVectorField\s*;/.test(text)
    let payload = internal[2]!.trim()
    let expected = vector ? 3 : 1
    if (internal[1] === 'nonuniform') {
      const list = /^List<(scalar|vector)>\s+(\d+)\s*\(([\s\S]*)\)\s*$/.exec(payload)
      if (!list || (list[1] === 'vector') !== vector || Number(list[2]) <= 0) { issues.push(`Malformed internalField list in ${name}`); continue }
      payload = list[3]!
      expected = Number(list[2]) * (vector ? 3 : 1)
    }
    const tokens = payload.replace(/[()]/g, ' ').trim().split(/\s+/)
    const values = tokens.map(Number)
    if (values.length !== expected || values.some(value => !Number.isFinite(value))) { issues.push(`Invalid count or non-finite internal values in ${name}`); continue }
    if (name.startsWith('alpha.') && values.some(value => value < -1e-6 || value > 1 + 1e-6)) { issues.push(`Phase fraction ${name} is outside [0,1]`); continue }
    if (['k', 'epsilon', 'omega', 'nut'].includes(name) && values.some(value => value < -1e-12)) { issues.push(`Negative turbulence quantity ${name}`); continue }
    checkedFields.push(name)
  }
  return { ok: issues.length === 0 && checkedFields.length > 0, time: selected.value, checkedFields, issues, scope: 'finite-written-internal-fields' }
}
