import { useEffect, useState } from 'react'
import { Check, ChevronDown, FileCode, RotateCcw, X } from 'lucide-react'
import type { DerivedDef, ParamDef, Value } from '@c/api'
import { findItem, useWorkbench } from '@c/store'
import { Notice, cn, formatNumber } from '@c/ui/primitives'
import { SECTION_LABELS } from './icons'

function labelOf(def: { label: string; symbol?: string }) {
  return (
    <>
      {def.symbol && <span className="mr-1 text-muted-foreground">({def.symbol})</span>}
      {def.label}
    </>
  )
}

function NumberField({ def, value, error, onCommit }: { def: ParamDef; value: number; error?: string; onCommit: (value: number) => void }) {
  const [text, setText] = useState(String(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (!focused) setText(String(value)) }, [value, focused])
  const parsed = Number(text)
  const invalid = text.trim() === '' || !Number.isFinite(parsed)
  const commit = () => {
    setFocused(false)
    if (invalid) { setText(String(value)); return }
    if (parsed !== value) onCommit(parsed)
  }
  return (
    <div className={cn('flex h-9 w-full items-center border-b-2 bg-transparent', error || (focused && invalid) ? 'border-danger' : focused ? 'border-accent-strong' : 'border-[#cfd6dd] hover:border-[#9aa6b2]')}>
      <input
        aria-label={def.label} inputMode="decimal" className="h-full min-w-0 flex-1 bg-transparent px-1 text-[15px] outline-none"
        value={text} onFocus={() => setFocused(true)} onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setText(String(value)); (e.target as HTMLInputElement).blur() } }}
      />
    </div>
  )
}

function SelectField({ def, value, onCommit }: { def: ParamDef; value: Value; onCommit: (value: Value) => void }) {
  return (
    <div className="relative h-9 w-full border-b-2 border-[#cfd6dd] hover:border-[#9aa6b2] focus-within:border-accent-strong">
      <select
        aria-label={def.label} className="h-full w-full cursor-pointer appearance-none bg-transparent pl-1 pr-7 text-[15px] outline-none"
        value={String(value)} onChange={(e) => { const option = def.options!.find((o) => String(o.value) === e.target.value); if (option) onCommit(option.value) }}
      >
        {def.options!.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[#77838f]" />
    </div>
  )
}

function ParamRow({ def }: { def: ParamDef }) {
  const value = useWorkbench((state) => state.workspace!.values[def.id]!)
  const error = useWorkbench((state) => state.fieldErrors[def.id])
  const setValue = useWorkbench((state) => state.setValue)
  const resetParams = useWorkbench((state) => state.resetParams)
  const modified = value !== def.default
  const defaultLabel = def.type === 'select' ? def.options!.find((o) => o.value === def.default)?.label ?? String(def.default) : String(def.default)
  return (
    <div className="px-4 py-1.5">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] items-center gap-3">
        <div className="flex min-w-0 items-center gap-1.5 text-[15px]" title={def.help}>
          {modified && <span className="h-2 w-2 shrink-0 rounded-full bg-accent-strong" title="Changed from the reference" />}
          <span className="truncate">{labelOf(def)}</span>
        </div>
        <div className="flex items-center gap-2">
          {def.type === 'number'
            ? <NumberField def={def} value={value as number} error={error} onCommit={(next) => void setValue(def.id, next)} />
            : <SelectField def={def} value={value} onCommit={(next) => void setValue(def.id, next)} />}
          {def.unit && <span className="w-11 shrink-0 text-[14px] text-[#4b5661]">{def.unit}</span>}
          {modified ? (
            <button type="button" aria-label={`Reset ${def.label} to ${defaultLabel}`} title={`Reset to reference: ${defaultLabel}`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-[#77838f] hover:bg-[#e9edf0]" onClick={() => void resetParams([def.id])}>
              <RotateCcw size={14} />
            </button>
          ) : <span className="w-7 shrink-0" />}
        </div>
      </div>
      {error && <p className="mt-1 text-[13px] text-danger">{error}</p>}
      {!error && def.help && <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{def.help}</p>}
    </div>
  )
}

function DerivedRow({ def }: { def: DerivedDef }) {
  const value = useWorkbench((state) => state.workspace!.derived[def.id])
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] items-center gap-3 px-4 py-1.5" title={def.help}>
      <div className="truncate text-[15px] text-[#4b5661]">{labelOf(def)}</div>
      <div className="flex items-center gap-2">
        <div className="flex h-8 flex-1 items-center rounded bg-[#f1f4f6] px-2 text-[15px] tabular-nums">{value === undefined ? '–' : formatNumber(value, def.digits ?? 4)}</div>
        {def.unit && <span className="w-11 shrink-0 text-[14px] text-[#4b5661]">{def.unit}</span>}
        <span className="w-7 shrink-0" />
      </div>
    </div>
  )
}

export function SettingsPanel({ itemId }: { itemId: string }) {
  const tutorial = useWorkbench((state) => state.tutorial)!
  const workspace = useWorkbench((state) => state.workspace)!
  const select = useWorkbench((state) => state.select)
  const setFocusPatch = useWorkbench((state) => state.setFocusPatch)
  const found = findItem(tutorial, itemId)
  if (!found) return null
  const { section, item } = found
  const params = (item.params ?? []).map((id) => tutorial.params.find((def) => def.id === id)!).filter(Boolean)
  const derived = (item.derived ?? []).map((id) => tutorial.derived.find((def) => def.id === id)!).filter(Boolean)
  const patches = (item.patches ?? []).map((name) => tutorial.geometry.patches.find((patch) => patch.name === name)!).filter(Boolean)
  const overridden = (item.files ?? []).filter((file) => workspace.overrides.includes(file))
  const close = () => select({ kind: 'geometry' })

  return (
    <div className="panel-float flex max-h-full w-[470px] max-w-full flex-col overflow-hidden">
      <div className="flex h-[58px] shrink-0 items-center gap-2 border-b pl-4 pr-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[18.5px] font-bold">{item.label}</div>
        </div>
        <button type="button" aria-label="Done" title="Done" className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-white hover:bg-[#2a333d]" onClick={close}><Check size={19} /></button>
        <button type="button" aria-label="Close" title="Close" className="flex h-10 w-10 items-center justify-center rounded-md border border-input hover:bg-muted" onClick={close}><X size={19} /></button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-2.5">
        {item.description && <p className="px-4 pb-2 text-[13.5px] leading-snug text-muted-foreground">{item.description}</p>}

        {overridden.length > 0 && (
          <div className="px-4 pb-2">
            <Notice tone="warning">
              You edited <span className="font-mono text-[12.5px]">{overridden.join(', ')}</span> by hand, so these form values are not written to {overridden.length > 1 ? 'those files' : 'that file'}.{' '}
              <button type="button" className="font-bold underline" onClick={() => select({ kind: 'files', path: overridden[0] })}>Review the file</button>
            </Notice>
          </div>
        )}

        {(item.rows ?? []).map((row) => (
          <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] items-center gap-3 px-4 py-1.5">
            <div className="truncate text-[15px]">{row.label}</div>
            <div className="flex h-9 items-center border-b-2 border-dashed border-[#dde2e7] px-1 text-[15px] text-[#4b5661]">{row.value}</div>
          </div>
        ))}
        {params.map((def) => <ParamRow key={def.id} def={def} />)}
        {derived.length > 0 && params.length + (item.rows?.length ?? 0) > 0 && <div className="mx-4 my-2 border-t" />}
        {derived.map((def) => <DerivedRow key={def.id} def={def} />)}

        {patches.length > 0 && (
          <div className="px-4 pt-3">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-[15px] font-bold">Assigned faces <span className="font-normal text-muted-foreground">({patches.length})</span></span>
              <span className="text-[12.5px] text-muted-foreground">mesh patch</span>
            </div>
            <div className="rounded border-2 border-accent-strong bg-accent">
              {patches.map((patch) => (
                <div
                  key={patch.name} className="flex h-10 items-center justify-between px-3 text-[15px]"
                  onMouseEnter={() => setFocusPatch(patch.name)} onMouseLeave={() => setFocusPatch(null)}
                >
                  <span>{patch.label}</span>
                  <span className="font-mono text-[12.5px] text-accent-foreground">{patch.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(item.files?.length ?? 0) > 0 && (
          <div className="px-4 pt-3.5">
            <div className="mb-1.5 text-[12.5px] font-bold tracking-wide text-muted-foreground uppercase">Written to</div>
            <div className="flex flex-wrap gap-1.5">
              {item.files!.map((file) => (
                <button key={file} type="button" className="flex items-center gap-1.5 rounded border bg-[#f6f8f9] px-2 py-1 font-mono text-[12.5px] hover:border-accent-strong hover:bg-accent" onClick={() => select({ kind: 'files', path: file })} title="Open this OpenFOAM dictionary">
                  <FileCode size={13} /> {file}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex h-9 shrink-0 items-center border-t bg-[#fafbfc] px-4 text-[12.5px] text-muted-foreground">{SECTION_LABELS[section.node]} · changes are saved automatically</div>
    </div>
  )
}
