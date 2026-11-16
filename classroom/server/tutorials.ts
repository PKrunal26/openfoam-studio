/**
 * Tutorial catalog: loads classroom/tutorials/<id>/{tutorial.json,guide.md,case/**},
 * validates parameter values and renders the OpenFOAM case for a parameter set.
 *
 * A tutorial's case files are templates. `{{ expression }}` placeholders are the
 * only thing a parameter can influence, and parameters are range-checked numbers
 * or one of a fixed list of options: a student cannot inject dictionary text
 * through the forms. Whole-file overrides (advanced editing) are checked with
 * the same dictionary policy the desktop app uses before anything is executed.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { assertSafeDictionary } from '../../core/run/casePolicy.js'
import { normalizeLF } from '../../core/project/files.js'
import { OPENFOAM_IMAGE } from '../../core/docker/CommandRunner.js'
import { evaluateNumber, renderTemplate, type Scope, type Value } from './expr.js'

/** Bump when the run pipeline changes in a way that invalidates stored results. */
export const PIPELINE_VERSION = 2

export interface ParamOption { value: number | string; label: string }

export interface ParamDef {
  id: string
  label: string
  symbol?: string
  unit?: string
  type: 'number' | 'select'
  default: number | string
  min?: number
  max?: number
  integer?: boolean
  options?: ParamOption[]
  help?: string
}

export interface DerivedDef {
  id: string
  label: string
  symbol?: string
  unit?: string
  expr: string
  /** significant digits shown in the UI */
  digits?: number
  help?: string
}

export interface ConstraintDef {
  expr: string
  message: string
  level?: 'error' | 'warning'
}

export type SectionNode =
  | 'model' | 'materials' | 'initialConditions' | 'boundaryConditions'
  | 'numerics' | 'simulationControl' | 'mesh'

export interface SettingItem {
  id: string
  label: string
  icon?: string
  description?: string
  /** Boundary patches this setting applies to (highlighted in the viewport). */
  patches?: string[]
  /** Case files this setting writes to (shown as "Written to"). */
  files?: string[]
  /** Fixed, non-editable facts about the setting. */
  rows?: { label: string; value: string }[]
  params?: string[]
  derived?: string[]
}

export interface Section { node: SectionNode; items: SettingItem[] }

export interface PatchDef {
  name: string
  label: string
  kind: 'inlet' | 'outlet' | 'wall' | 'movingWall' | 'open' | 'empty'
}

export interface MonitorDef {
  title: string
  yLabel?: string
  /** `file` is the function-object name under postProcessing/; `column` a name from its header. */
  series: { file: string; column: string; label: string }[]
}

export interface TutorialDef {
  id: string
  order: number
  title: string
  subtitle: string
  summary: string
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced'
  analysisType: string
  solver: string
  dimension: '2D' | '3D'
  tags: string[]
  estimatedRuntime: string
  geometry: { name: string; description: string; patches: PatchDef[] }
  params: ParamDef[]
  derived: DerivedDef[]
  constraints: ConstraintDef[]
  sections: Section[]
  run: {
    maxWallSeconds: number
    fields: string[]
    steady: boolean
    /** Expression for the final solver time, used for the progress bar. */
    endTime: string
    /** Leave the t = 0 state out of the exported results. */
    skipInitial?: boolean
  }
  /** Parameter sets used by the guide's exercises, solved by `npm run classroom:verify`. */
  verify?: { values: Record<string, unknown>; expect?: 'succeeded' | 'failed' }[]
  /** Time histories written by function objects (forces, patch averages) shown as plots. */
  monitors?: MonitorDef[]
  results: {
    defaultField: string
    fields: Record<string, { label: string; unit: string }>
    view: '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z' | 'iso'
    slice?: { normal: [number, number, number]; origin: [number, number, number] }
  }
}

export interface Tutorial {
  def: TutorialDef
  guide: string
  /** relPath ('/'-separated) → template text */
  templates: Map<string, string>
  defaults: Record<string, Value>
}

export interface ResolvedParams {
  values: Record<string, Value>
  derived: Record<string, number>
  issues: { level: 'error' | 'warning'; message: string; param?: string }[]
}

const ID = /^[A-Za-z][A-Za-z0-9_]{0,40}$/
const TUTORIAL_ID = /^[a-z][a-z0-9-]{1,40}$/
const SECTION_NODES: SectionNode[] = ['model', 'materials', 'initialConditions', 'boundaryConditions', 'numerics', 'simulationControl', 'mesh']
const MAX_OVERRIDE_BYTES = 256 * 1024

function fail(tutorial: string, message: string): never {
  throw new Error(`Tutorial "${tutorial}": ${message}`)
}

function readCaseTemplates(caseDir: string): Map<string, string> {
  const templates = new Map<string, string>()
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`Symbolic link in tutorial case: ${entry.name}`)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) {
        const rel = path.relative(caseDir, full).split(path.sep).join('/')
        if (!/^(?:0|constant|system)\//.test(rel)) throw new Error(`Unexpected file outside 0/, constant/, system/: ${rel}`)
        templates.set(rel, normalizeLF(fs.readFileSync(full, 'utf8')))
      }
    }
  }
  walk(caseDir)
  return new Map([...templates.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

function coerce(def: ParamDef, raw: unknown): { value: Value; error?: string } {
  if (def.type === 'select') {
    const option = def.options!.find(o => o.value === raw || String(o.value) === String(raw))
    if (!option) return { value: def.default, error: `${def.label}: choose one of the listed options` }
    return { value: option.value }
  }
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
  if (!Number.isFinite(value)) return { value: def.default, error: `${def.label}: enter a number` }
  if (def.integer && !Number.isInteger(value)) return { value: def.default, error: `${def.label}: must be a whole number` }
  if (def.min !== undefined && value < def.min) return { value: def.default, error: `${def.label}: must be at least ${def.min}` }
  if (def.max !== undefined && value > def.max) return { value: def.default, error: `${def.label}: must be at most ${def.max}` }
  return { value }
}

/** Validate student-supplied values against the tutorial's declared parameters. */
export function resolveParams(tutorial: Tutorial, input: Record<string, unknown> = {}): ResolvedParams {
  const values: Record<string, Value> = {}
  const issues: ResolvedParams['issues'] = []
  for (const def of tutorial.def.params) {
    if (Object.hasOwn(input, def.id) && input[def.id] !== undefined) {
      const { value, error } = coerce(def, input[def.id])
      values[def.id] = value
      if (error) issues.push({ level: 'error', message: error, param: def.id })
    } else values[def.id] = def.default
  }
  const scope: Scope = { ...values }
  const derived: Record<string, number> = {}
  for (const def of tutorial.def.derived) {
    const value = evaluateNumber(def.expr, scope)
    derived[def.id] = value
    scope[def.id] = value
  }
  if (!issues.length) {
    for (const constraint of tutorial.def.constraints) {
      if (!evaluateNumber(constraint.expr, scope)) {
        issues.push({ level: constraint.level ?? 'error', message: constraint.message })
      }
    }
  }
  return { values, derived, issues }
}

/** Only the entries that differ from the tutorial defaults (what the student changed). */
export function changedParams(tutorial: Tutorial, values: Record<string, Value>): Record<string, Value> {
  const changed: Record<string, Value> = {}
  for (const def of tutorial.def.params) {
    if (values[def.id] !== undefined && values[def.id] !== def.default) changed[def.id] = values[def.id]!
  }
  return changed
}

export function validateOverride(tutorial: Tutorial, relPath: string, content: string): string {
  if (!tutorial.templates.has(relPath)) throw new Error(`Not an editable case file: ${relPath}`)
  if (Buffer.byteLength(content) > MAX_OVERRIDE_BYTES) throw new Error('File is too large (256 KB limit)')
  if (content.includes('\0')) throw new Error('File contains binary data')
  const normalized = normalizeLF(content)
  assertSafeDictionary(normalized, relPath, MAX_OVERRIDE_BYTES)
  return normalized
}

export interface RenderedCase {
  files: Map<string, string>
  hash: string
  endTime: number
}

/** Render the full case for a parameter set, with optional whole-file overrides on top. */
export function renderCase(
  tutorial: Tutorial,
  resolved: ResolvedParams,
  overrides: Record<string, string> = {},
): RenderedCase {
  const scope: Scope = { ...resolved.values, ...resolved.derived }
  const files = new Map<string, string>()
  for (const [relPath, template] of tutorial.templates) {
    const override = Object.hasOwn(overrides, relPath) ? overrides[relPath] : undefined
    const content = override !== undefined
      ? validateOverride(tutorial, relPath, override)
      : renderTemplate(template, scope, relPath)
    files.set(relPath, content.endsWith('\n') ? content : `${content}\n`)
  }
  const hash = createHash('sha256')
  hash.update(`ofs-classroom:${PIPELINE_VERSION}:${OPENFOAM_IMAGE}:${tutorial.def.id}\0`)
  hash.update(JSON.stringify(tutorial.def.run.fields)).update('\0')
  for (const [relPath, content] of files) hash.update(relPath).update('\0').update(content).update('\0')
  return { files, hash: hash.digest('hex').slice(0, 40), endTime: evaluateNumber(tutorial.def.run.endTime, scope) }
}

function validateDefinition(def: TutorialDef, dirName: string): void {
  const t = def.id ?? dirName
  if (!TUTORIAL_ID.test(def.id ?? '')) fail(t, 'id must be lowercase letters, digits and dashes')
  if (def.id !== dirName) fail(t, `id must match its directory name (${dirName})`)
  for (const key of ['title', 'subtitle', 'summary', 'analysisType', 'solver', 'estimatedRuntime'] as const) {
    if (typeof def[key] !== 'string' || !def[key]) fail(t, `missing ${key}`)
  }
  if (!Array.isArray(def.params) || !Array.isArray(def.sections)) fail(t, 'params and sections are required')
  def.derived ??= []
  def.constraints ??= []
  def.tags ??= []
  const names = new Set<string>()
  for (const p of def.params) {
    if (!ID.test(p.id)) fail(t, `invalid parameter id "${p.id}"`)
    if (names.has(p.id)) fail(t, `duplicate id "${p.id}"`)
    names.add(p.id)
    if (p.type === 'select') {
      if (!p.options?.length) fail(t, `select parameter "${p.id}" needs options`)
      for (const o of p.options) {
        // Option values are substituted into dictionaries verbatim: keep them to plain tokens.
        if (typeof o.value === 'string' && !/^[\w.() ,:-]{1,80}$/.test(o.value)) fail(t, `unsafe option value in "${p.id}"`)
      }
      if (!p.options.some(o => o.value === p.default)) fail(t, `default of "${p.id}" is not one of its options`)
    } else if (p.type === 'number') {
      if (typeof p.default !== 'number' || !Number.isFinite(p.default)) fail(t, `default of "${p.id}" must be a number`)
      if (p.min === undefined || p.max === undefined) fail(t, `number parameter "${p.id}" needs min and max`)
      if (p.default < p.min! || p.default > p.max!) fail(t, `default of "${p.id}" is outside its range`)
    } else fail(t, `unknown parameter type for "${p.id}"`)
  }
  for (const d of def.derived) {
    if (!ID.test(d.id) || names.has(d.id)) fail(t, `invalid or duplicate derived id "${d.id}"`)
    names.add(d.id)
  }
  const patches = new Set(def.geometry?.patches?.map(p => p.name) ?? [])
  if (!patches.size) fail(t, 'geometry.patches is required')
  const itemIds = new Set<string>()
  for (const section of def.sections) {
    if (!SECTION_NODES.includes(section.node)) fail(t, `unknown section node "${section.node}"`)
    for (const item of section.items) {
      if (!ID.test(item.id) || itemIds.has(item.id)) fail(t, `invalid or duplicate setting id "${item.id}"`)
      itemIds.add(item.id)
      for (const id of [...(item.params ?? []), ...(item.derived ?? [])]) {
        if (!names.has(id)) fail(t, `setting "${item.id}" references unknown "${id}"`)
      }
      for (const patch of item.patches ?? []) if (!patches.has(patch)) fail(t, `setting "${item.id}" references unknown patch "${patch}"`)
    }
  }
  if (!def.run || !(def.run.maxWallSeconds > 0) || !Array.isArray(def.run.fields)) fail(t, 'run settings are incomplete')
  for (const field of def.run.fields) if (!/^[\w.]+$/.test(field)) fail(t, `invalid field name "${field}"`)
  def.monitors ??= []
  for (const monitor of def.monitors) {
    if (!monitor.title || !monitor.series?.length) fail(t, 'monitor needs a title and series')
    for (const series of monitor.series) if (!/^\w+$/.test(series.file) || !series.column || !series.label) fail(t, `invalid monitor series in "${monitor.title}"`)
  }
  if (!def.results?.defaultField || !def.results.fields?.[def.results.defaultField]) fail(t, 'results.defaultField must be listed in results.fields')
}

export function loadTutorial(dir: string): Tutorial {
  const dirName = path.basename(dir)
  const def = JSON.parse(fs.readFileSync(path.join(dir, 'tutorial.json'), 'utf8')) as TutorialDef
  validateDefinition(def, dirName)
  const guidePath = path.join(dir, 'guide.md')
  const guide = fs.existsSync(guidePath) ? normalizeLF(fs.readFileSync(guidePath, 'utf8')) : ''
  const templates = readCaseTemplates(path.join(dir, 'case'))
  for (const section of def.sections) for (const item of section.items) for (const file of item.files ?? []) {
    if (!templates.has(file)) fail(def.id, `setting "${item.id}" references missing case file ${file}`)
  }
  const defaults: Record<string, Value> = {}
  for (const p of def.params) defaults[p.id] = p.default
  const tutorial: Tutorial = { def, guide, templates, defaults }
  // The defaults must render to a policy-clean case, with every constraint satisfied.
  const resolved = resolveParams(tutorial)
  const errors = resolved.issues.filter(issue => issue.level === 'error')
  if (errors.length) fail(def.id, `defaults violate a constraint: ${errors[0]!.message}`)
  const rendered = renderCase(tutorial, resolved)
  for (const [relPath, content] of rendered.files) {
    if (/\{\{|\}\}/.test(content)) fail(def.id, `unrendered placeholder in ${relPath}`)
    assertSafeDictionary(content, relPath)
  }
  if (!rendered.files.has('system/controlDict') || !rendered.files.has('system/blockMeshDict')) {
    fail(def.id, 'case needs system/controlDict and system/blockMeshDict')
  }
  // Every option of every select must render too (catches typos in rarely used options).
  for (const p of def.params) {
    if (p.type !== 'select') continue
    for (const option of p.options!) renderCase(tutorial, resolveParams(tutorial, { [p.id]: option.value }))
  }
  return tutorial
}

export function loadCatalog(tutorialsDir: string): Map<string, Tutorial> {
  const catalog = new Map<string, Tutorial>()
  if (!fs.existsSync(tutorialsDir)) return catalog
  const loaded: Tutorial[] = []
  for (const entry of fs.readdirSync(tutorialsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.startsWith('_')) continue
    if (!fs.existsSync(path.join(tutorialsDir, entry.name, 'tutorial.json'))) continue
    loaded.push(loadTutorial(path.join(tutorialsDir, entry.name)))
  }
  loaded.sort((a, b) => a.def.order - b.def.order || a.def.id.localeCompare(b.def.id))
  for (const tutorial of loaded) catalog.set(tutorial.def.id, tutorial)
  return catalog
}
