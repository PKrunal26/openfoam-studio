import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
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

type EditMap = Record<string, Record<string, string>>

export function ParametersTab() {
  const project = useProjectStore((s) => s.project)
  const files = useProjectStore((s) => s.files)
  const [sections, setSections] = useState<FileSection[]>([])
  const [edits, setEdits] = useState<EditMap>({})
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
        setEdits({})
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [project?.id, candidatePaths.join('|')])

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
    setEdits((prev) => ({
      ...prev,
      [relPath]: { ...(prev[relPath] ?? {}), [key]: value },
    }))
  }

  const dirtySections = sections.filter((s) => {
    const e = edits[s.relPath]
    return e && s.entries.some((entry) => e[entry.key] != null && e[entry.key] !== entry.value)
  })
  const anyDirty = dirtySections.length > 0

  const onSaveAll = async () => {
    if (!project || !anyDirty) return
    setSaving(true)
    setError(null)
    try {
      const updated: FileSection[] = []
      for (const s of dirtySections) {
        const e = edits[s.relPath]
        let next = s.text
        for (const entry of s.entries) {
          const newVal = e[entry.key]
          if (newVal != null && newVal !== entry.value) {
            next = setValue(next, entry.key, newVal)
          }
        }
        await api.writeFile(project.id, s.relPath, next)
        updated.push({ ...s, text: next, entries: parseDict(next).entries })
      }
      setSections((prev) =>
        prev.map((sec) => updated.find((u) => u.relPath === sec.relPath) ?? sec),
      )
      setEdits({})
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
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
        {error && (
          <div className="mx-auto mb-4 max-w-2xl rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {sections.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            No parameters yet. Generate the case files first.
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-8">
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
                    {s.entries.map((entry) => {
                      const editVal = edits[s.relPath]?.[entry.key]
                      const value = editVal ?? entry.value
                      const changed = editVal != null && editVal !== entry.value
                      const label = FRIENDLY_LABELS[entry.key] ?? entry.key
                      return (
                        <label key={entry.key} className="flex flex-col gap-1">
                          <span className="text-[11px] text-muted-foreground">
                            {label}
                            {entry.units && (
                              <span className="ml-1 opacity-60">{entry.units}</span>
                            )}
                          </span>
                          <input
                            type="text"
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
