import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useEditorStore, isDirty } from '@/store/useEditorStore'
import { useProjectStore } from '@/store/useProjectStore'
import * as api from '@/lib/api'
import { parseDict, setValue, type DictEntry } from '@/lib/dictParser'
import { cn } from '@/lib/cn'

const KNOWN_PATHS = [
  'system/controlDict',
  'constant/physicalProperties',
  'constant/momentumTransport',
  'constant/turbulenceProperties',
  'constant/transportProperties',
] as const

const FRIENDLY_LABELS: Record<string, string> = {
  application: 'Application',
  solver: 'Solver',
  startFrom: 'Start from',
  startTime: 'Start time',
  stopAt: 'Stop at',
  endTime: 'End time',
  deltaT: 'Time step',
  writeControl: 'Write control',
  writeInterval: 'Write interval',
  purgeWrite: 'Purge writes',
  writeFormat: 'Write format',
  writePrecision: 'Write precision',
  writeCompression: 'Write compression',
  timeFormat: 'Time format',
  timePrecision: 'Time precision',
  runTimeModifiable: 'Runtime modifiable',
  viscosityModel: 'Viscosity model',
  nu: 'Kinematic viscosity',
  rho: 'Density',
  simulationType: 'Simulation type',
}

const SECTION_TITLES: Record<string, string> = {
  'system/controlDict': 'Run control',
  'constant/physicalProperties': 'Physical properties',
  'constant/momentumTransport': 'Momentum transport',
  'constant/turbulenceProperties': 'Turbulence',
  'constant/transportProperties': 'Transport',
}

interface FileSection {
  relPath: string
  text: string
  entries: DictEntry[]
}

const UNITS: Record<string, string> = { nu: 'm²/s', rho: 'kg/m³', startTime: 's', endTime: 's', deltaT: 's' }
const ENUMS: Record<string, string[]> = {
  startFrom: ['startTime', 'firstTime', 'latestTime'], stopAt: ['endTime', 'writeNow', 'noWriteNow', 'nextWrite'],
  writeControl: ['timeStep', 'runTime', 'adjustableRunTime', 'cpuTime', 'clockTime'],
  writeFormat: ['ascii', 'binary'], writeCompression: ['on', 'off', 'compressed', 'uncompressed'],
  runTimeModifiable: ['true', 'false', 'yes', 'no', 'on', 'off'], simulationType: ['laminar', 'RAS', 'LES'],
}
export function validateParameter(key: string, value: string): string | null {
  if (!value.trim() || /[;{}\n\r]/.test(value)) return 'Enter one dictionary value without delimiters.'
  if (ENUMS[key] && !ENUMS[key].includes(value)) return `Choose ${ENUMS[key].join(', ')}.`
  if (['nu', 'rho', 'deltaT', 'writeInterval', 'startTime', 'endTime', 'purgeWrite', 'writePrecision', 'timePrecision'].includes(key)) {
    const number = Number(value)
    if (!Number.isFinite(number)) return 'Enter a finite number.'
    if (['nu', 'rho', 'deltaT', 'writeInterval'].includes(key) && number <= 0) return 'Must be greater than zero.'
    if (['startTime', 'endTime', 'purgeWrite'].includes(key) && number < 0) return 'Must be zero or greater.'
    if (['purgeWrite', 'writePrecision', 'timePrecision'].includes(key) && !Number.isInteger(number)) return 'Enter a whole number.'
  }
  return null
}

export function ParametersTab() {
  const project = useProjectStore((s) => s.project)
  const files = useProjectStore((s) => s.files)
  const [sections, setSections] = useState<FileSection[]>([])
  const tabs = useEditorStore((s) => s.tabs)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const candidatePaths = useMemo(() => {
    const present = new Set(files.map((f) => f.relPath))
    return KNOWN_PATHS.filter((p) => present.has(p))
  }, [files])

  useEffect(() => {
    if (!project) return
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all(
      candidatePaths.map(async (relPath) => {
        const text = await api.readFile(project.id, relPath)
        const { entries } = parseDict(text)
        return { relPath, text, entries }
      }),
    )
      .then((results) => {
        if (cancelled) return
        setSections(results.filter((s) => s.entries.length > 0))

      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [project?.id, files])

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No project loaded.
      </div>
    )
  }

  if (loading && sections.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        Reading dict files…
      </div>
    )
  }

  const onChange = (relPath: string, key: string, value: string) => {
    const section = sections.find((s) => s.relPath === relPath)
    if (!section || saving) return
    const invalid = validateParameter(key, value)
    setValidationError(invalid ? `${FRIENDLY_LABELS[key] ?? key}: ${invalid}` : null)
    const id = `case:${relPath}`
    const existing = useEditorStore.getState().tabs.find((t) => t.id === id)
    const text = existing?.content ?? section.text
    const content = invalid ? text : setValue(text, key, value)
    const parameterDrafts = { ...existing?.parameterDrafts, [key]: value }
    const validationError = Object.entries(parameterDrafts).map(([draftKey, draftValue]) => validateParameter(draftKey, draftValue)).find(Boolean) ?? null
    if (existing) useEditorStore.setState((s) => ({ tabs: s.tabs.map((t) => t.id === id ? { ...t, content, parameterDrafts, validationError } : t) }))
    else useEditorStore.setState((s) => ({ tabs: [...s.tabs, { id, kind: 'case', projectId: project.id, relPath, label: relPath.split('/').pop() ?? relPath, content, savedContent: section.text, parameterDrafts, validationError }] }))
  }
  const dirtySections = sections.filter((s) => tabs.some((tab) => tab.relPath === s.relPath && isDirty(tab)))
  const anyDirty = dirtySections.length > 0
  const onSaveAll = async () => {
    if (!anyDirty) return
    if (validationError) { setError(validationError); return }
    const invalid = dirtySections.flatMap((s) => parseDict(tabs.find((t) => t.relPath === s.relPath)?.content ?? s.text).entries.map((entry) => validateParameter(entry.key, entry.value)).filter(Boolean))[0]
    if (invalid) { setError(invalid); return }
    setSaving(true); setError(null)
    try {
      for (const s of dirtySections) await useEditorStore.getState().saveTab(project.id, `case:${s.relPath}`)
      await useEditorStore.getState().reloadFiles(project.id)
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setSaving(false) }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-7 shrink-0 items-center justify-between border-b bg-sidebar/40 px-3 text-[11px] text-muted-foreground">
        <span>Parameters</span>
        <button
          onClick={onSaveAll}
          disabled={!anyDirty || saving}
          className={cn(
            'inline-flex items-center gap-1 rounded-sm px-2 py-0.5',
            anyDirty
              ? 'text-foreground hover:bg-accent'
              : 'cursor-default opacity-40',
          )}
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          {anyDirty ? `Save (${dirtySections.length})` : 'Saved'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {(error || validationError) && (
          <div className="mx-auto mb-4 max-w-2xl rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error || validationError}
          </div>
        )}

        {sections.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            No parameters yet. Generate the case files first.
          </div>
        ) : (
<div className="mx-auto flex max-w-2xl flex-col gap-8"><p className="text-xs leading-relaxed text-muted-foreground">Changes share the file editor buffers. Save before running. OpenFOAM dimension vectors stay in the file; units below describe recognized quantities. Changing solver or turbulence settings may require additional fields.</p>
            {sections.map((s) => {
              const title = SECTION_TITLES[s.relPath] ?? s.relPath
              return (
                <section key={s.relPath}>
                  <header className="mb-3 flex items-baseline justify-between">
                    <h3 className="text-xs font-medium text-foreground">{title}</h3>
                    <span className="font-mono text-[10px] text-muted-foreground/70">
                      {s.relPath}
                    </span>
                  </header>

                  <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                    {parseDict(tabs.find((tab) => tab.relPath === s.relPath)?.content ?? s.text).entries.map((entry) => {
                      const value = tabs.find((tab) => tab.relPath === s.relPath)?.parameterDrafts?.[entry.key] ?? entry.value
                      const original = s.entries.find((e) => e.key === entry.key)?.value
                      const changed = value !== original
                      const label = FRIENDLY_LABELS[entry.key] ?? entry.key
                      return (
                        <label key={entry.key} className="flex flex-col gap-1">
                          <span className="text-[11px] text-muted-foreground">
                            {label}
                            {(UNITS[entry.key] || entry.units) && (
                              <span className="ml-1 opacity-60">{UNITS[entry.key] ?? entry.units}</span>
                            )}
                          </span>
                          <input
                            type="text"
                            disabled={saving}
                            aria-invalid={!!validateParameter(entry.key, value)}
                            value={value}
                            onChange={(e) => onChange(s.relPath, entry.key, e.target.value)}
                            className={cn(
                              'h-7 w-full rounded-sm border-0 border-b bg-transparent px-0 font-mono text-xs',
                              'focus:border-foreground focus:outline-none focus:ring-0',
                              changed
                                ? 'border-amber-500/70'
                                : 'border-border/60',
                            )}
                            spellCheck={false}
                          />
                        </label>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
