import { useEffect, useState, type ReactNode } from 'react'
import { Eye, EyeOff, RotateCcw, X } from 'lucide-react'
import { COLORMAPS } from '@/lib/vtk/colormaps'
import { colormapGradient } from '@/lib/vtk/colormapSamples'
import type { DerivedDef, ParamDef, Value } from '@c/api'
import { findItem, useViewerInfo, useWorkbench, type DisplayState } from '@c/store'
import { Notice, Segmented, Select, Switch, cn, formatNumber } from '@c/ui/primitives'
import { ItemIcon, SECTION_LABELS } from './icons'

// ── Frame ────────────────────────────────────────────────────────────────────

function Frame({ eyebrow, title, onClose, children, footer }: { eyebrow: string; title: string; onClose?: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <aside className="flex h-full w-[328px] shrink-0 flex-col border-r" aria-label={title}>
      <header className="flex shrink-0 items-start gap-2 px-5 pb-4 pt-5">
        <div className="min-w-0 flex-1">
          <p className="t-eyebrow">{eyebrow}</p>
          <h2 className="t-title mt-1.5 text-[21px]">{title}</h2>
        </div>
        {onClose && <button type="button" aria-label="Close" title="Close" className="-mr-1.5 -mt-1 flex h-8 w-8 items-center justify-center text-ink-3 hover:bg-wash hover:text-ink" onClick={onClose}><X size={17} /></button>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">{children}</div>
      {footer && <footer className="shrink-0 border-t px-5 py-2.5 font-mono text-[11px] text-ink-3">{footer}</footer>}
    </aside>
  )
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <h3 className="t-eyebrow mb-2.5">{label}</h3>
      {children}
    </section>
  )
}

function FieldLabel({ def, modified }: { def: { label: string; symbol?: string }; modified?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium">
      <span className="truncate">{def.label}</span>
      {def.symbol && <span className="font-mono text-[12px] font-normal text-ink-3">{def.symbol}</span>}
      {modified && <span className="h-2 w-2 shrink-0 bg-v4 outline outline-1 outline-[#c9b700]" title="Changed from the reference" />}
    </span>
  )
}

// ── Setup ────────────────────────────────────────────────────────────────────

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
    <div className={cn('flex h-9 items-stretch border bg-paper transition-colors', error || (focused && invalid) ? 'border-bad' : focused ? 'border-primary ring-1 ring-primary' : 'border-line-strong hover:border-ink')}>
      <input
        aria-label={def.label} inputMode="decimal" className="t-mono min-w-0 flex-1 bg-transparent px-2.5 text-[13.5px] outline-none"
        value={text} onFocus={() => setFocused(true)} onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setText(String(value)); (e.target as HTMLInputElement).blur() } }}
      />
      {def.unit && <span className="flex items-center border-l bg-wash px-2.5 text-[12.5px] text-ink-3">{def.unit}</span>}
    </div>
  )
}

function ParamField({ def }: { def: ParamDef }) {
  const value = useWorkbench((state) => state.workspace!.values[def.id]!)
  const error = useWorkbench((state) => state.fieldErrors[def.id])
  const setValue = useWorkbench((state) => state.setValue)
  const resetParams = useWorkbench((state) => state.resetParams)
  const modified = value !== def.default
  const referenceLabel = def.type === 'select' ? def.options!.find((o) => o.value === def.default)?.label ?? String(def.default) : String(def.default)
  return (
    <div className="mt-4 first:mt-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <FieldLabel def={def} modified={modified} />
        {modified && (
          <button type="button" className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-ink-3 hover:text-ink" title={`Reset to the reference value: ${referenceLabel}`} onClick={() => void resetParams([def.id])}>
            <RotateCcw size={11} /> ref {def.type === 'number' ? referenceLabel : ''}
          </button>
        )}
      </div>
      {def.type === 'number'
        ? <NumberField def={def} value={value as number} error={error} onCommit={(next) => void setValue(def.id, next)} />
        : (
          <Select
            label={def.label} value={String(value)} options={def.options!.map((option) => ({ value: String(option.value), label: option.label }))}
            onChange={(next) => { const option = def.options!.find((o) => String(o.value) === next); if (option) void setValue(def.id, option.value as Value) }}
          />
        )}
      {error ? <p className="mt-1.5 text-[12.5px] text-bad">{error}</p> : def.help && <p className="mt-1.5 text-[12.5px] leading-snug text-ink-3">{def.help}</p>}
    </div>
  )
}

function Fact({ label, value, unit, title }: { label: ReactNode; value: ReactNode; unit?: string; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2 text-[13px] last:border-b-0" title={title}>
      <span className="min-w-0 text-ink-2">{label}</span>
      <span className="t-mono shrink-0 text-right text-ink">{value}{unit && <span className="ml-1.5 font-sans text-[12.5px] text-ink-3">{unit}</span>}</span>
    </div>
  )
}

function DerivedFact({ def }: { def: DerivedDef }) {
  const value = useWorkbench((state) => state.workspace!.derived[def.id])
  return (
    <Fact
      title={def.help} unit={def.unit} value={value === undefined ? '–' : formatNumber(value, def.digits ?? 4)}
      label={<>{def.label}{def.symbol && <span className="ml-1.5 font-mono text-[12px] text-ink-3">{def.symbol}</span>}</>}
    />
  )
}

export function SetupInspector({ itemId }: { itemId: string }) {
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

  return (
    <Frame eyebrow={SECTION_LABELS[section.node]} title={item.label} onClose={() => select({ kind: 'geometry' })} footer="Changes save automatically">
      {item.description && <p className="text-[13.5px] leading-relaxed text-ink-2">{item.description}</p>}

      {overridden.length > 0 && (
        <div className="mt-4">
          <Notice tone="warning">
            You edited <span className="font-mono text-[12px]">{overridden.join(', ')}</span> by hand, so the values here are not written to {overridden.length > 1 ? 'those files' : 'that file'}.{' '}
            <button type="button" className="font-medium underline underline-offset-2" onClick={() => select({ kind: 'files', path: overridden[0] })}>Review the file</button>
          </Notice>
        </div>
      )}

      {params.length > 0 && <Block label="Settings">{params.map((def) => <ParamField key={def.id} def={def} />)}</Block>}

      {derived.length > 0 && <Block label="Computed">{derived.map((def) => <DerivedFact key={def.id} def={def} />)}</Block>}

      {(item.rows?.length ?? 0) > 0 && (
        <Block label="Fixed in this tutorial">{item.rows!.map((row) => <Fact key={row.label} label={row.label} value={row.value} />)}</Block>
      )}

      {patches.length > 0 && (
        <Block label={`Assigned to ${patches.length === 1 ? '1 patch' : `${patches.length} patches`}`}>
          {patches.map((patch) => (
            <div
              key={patch.name} className="flex cursor-default items-center gap-2.5 border-b py-2 text-[13px] last:border-b-0 hover:bg-wash"
              onMouseEnter={() => setFocusPatch(patch.name)} onMouseLeave={() => setFocusPatch(null)}
            >
              <span className="h-2.5 w-2.5 shrink-0 bg-v2" />
              <span className="min-w-0 flex-1 truncate">{patch.label}</span>
              <span className="t-mono text-ink-3">{patch.name}</span>
            </div>
          ))}
        </Block>
      )}

      {(item.files?.length ?? 0) > 0 && (
        <Block label="Written to">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {item.files!.map((file) => (
              <button key={file} type="button" className="t-mono text-[12.5px] text-primary-ink underline decoration-line-strong underline-offset-4 hover:decoration-primary" onClick={() => select({ kind: 'files', path: file })} title="Open this OpenFOAM dictionary">
                {file}
              </button>
            ))}
          </div>
        </Block>
      )}
    </Frame>
  )
}

// ── Geometry ─────────────────────────────────────────────────────────────────

export function GeometryInspector() {
  const tutorial = useWorkbench((state) => state.tutorial)!
  const hidden = useWorkbench((state) => state.hiddenPatches)
  const togglePatch = useWorkbench((state) => state.togglePatch)
  const setFocusPatch = useWorkbench((state) => state.setFocusPatch)
  const select = useWorkbench((state) => state.select)
  const reference = useWorkbench((state) => state.workspace!.runs[0]!)
  const bcItems = tutorial.sections.find((section) => section.node === 'boundaryConditions')?.items ?? []
  return (
    <Frame eyebrow="Geometry" title={tutorial.geometry.name}>
      <p className="text-[13.5px] leading-relaxed text-ink-2">{tutorial.geometry.description}</p>
      <Block label="Boundary patches">
        {tutorial.geometry.patches.map((patch) => {
          const isHidden = hidden.includes(patch.name)
          const owner = bcItems.find((item) => item.patches?.includes(patch.name))
          return (
            <div key={patch.name} className="group flex h-9 items-center gap-2.5 border-b text-[13px] last:border-b-0 hover:bg-wash" onMouseEnter={() => setFocusPatch(patch.name)} onMouseLeave={() => setFocusPatch(null)}>
              <button type="button" className={cn('flex min-w-0 flex-1 items-center gap-2.5 text-left', isHidden && 'opacity-45')} onClick={() => owner && select({ kind: 'item', itemId: owner.id })} title={owner ? `Open the boundary condition for ${patch.label}` : patch.label}>
                <span className="text-ink-3"><ItemIcon icon={patch.kind} /></span>
                <span className="truncate">{patch.label}</span>
              </button>
              <span className="t-mono text-ink-4 group-hover:hidden">{patch.name}</span>
              <button type="button" aria-label={isHidden ? `Show ${patch.label}` : `Hide ${patch.label}`} title={isHidden ? 'Show' : 'Hide'} className={cn('h-7 w-7 items-center justify-center text-ink-3 hover:text-ink', isHidden ? 'flex' : 'hidden group-hover:flex')} onClick={() => togglePatch(patch.name)}>
                {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          )
        })}
      </Block>
      <Block label="Reference mesh">
        <Fact label="Cells" value={reference.result?.cells?.toLocaleString() ?? '–'} />
        <Fact label="Dimension" value={tutorial.dimension} />
        <Fact label="Solver module" value={tutorial.solver} />
      </Block>
      <p className="mt-6 text-[12.5px] leading-snug text-ink-3">Hover a patch to find it on the model. Click one to open its boundary condition.</p>
    </Frame>
  )
}

// ── Results ──────────────────────────────────────────────────────────────────

export function ResultsInspector({ runLabel }: { runLabel: string }) {
  const tutorial = useWorkbench((state) => state.tutorial)!
  const display = useWorkbench((state) => state.display)
  const setDisplay = useWorkbench((state) => state.setDisplay)
  const info = useViewerInfo((state) => state.info)
  const names = info.fields.length ? info.fields.map((field) => field.name) : Object.keys(tutorial.results.fields)
  const current = info.fields.find((field) => field.name === display.field)
  const is3d = tutorial.dimension === '3D'
  const meta = (name: string) => tutorial.results.fields[name] ?? { label: name, unit: '' }

  return (
    <Frame eyebrow={runLabel} title="Solution fields">
      <Block label="Field">
        <Select
          label="Field" value={display.field} onChange={(field) => setDisplay({ field })}
          options={names.map((name) => ({ value: name, label: meta(name).label, hint: `${name}${meta(name).unit && meta(name).unit !== '–' ? `  ·  ${meta(name).unit}` : ''}` }))}
        />
        {(current?.numComponents ?? 1) > 1 && (
          <div className="mt-2.5">
            <Segmented
              label="Component" value={display.component} onChange={(component) => setDisplay({ component })}
              options={[{ value: -1 as DisplayState['component'], label: 'Magnitude' }, { value: 0, label: 'X' }, { value: 1, label: 'Y' }, { value: 2, label: 'Z' }]}
            />
          </div>
        )}
      </Block>

      <Block label="Color">
        <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Color map">
          {COLORMAPS.map((map) => (
            <button
              key={map.id} type="button" role="radio" aria-checked={display.colormap === map.id} title={map.label}
              className={cn('h-7 outline-offset-2', display.colormap === map.id ? 'outline outline-2 outline-ink' : 'hover:outline hover:outline-1 hover:outline-line-strong')}
              style={{ background: colormapGradient(map.id) }} onClick={() => setDisplay({ colormap: map.id })}
            >
              <span className="sr-only">{map.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[12.5px] text-ink-3">{COLORMAPS.find((map) => map.id === display.colormap)?.label}</p>
        {info.times.length > 1 && (
          <div className="mt-3">
            <Segmented
              label="Color range" value={display.rangeMode} onChange={(rangeMode) => setDisplay({ rangeMode })}
              options={[{ value: 'all', label: 'Whole run' }, { value: 'step', label: 'This step' }]}
            />
            <p className="mt-1.5 text-[12.5px] leading-snug text-ink-3">{display.rangeMode === 'all' ? 'One scale for every time step, so frames can be compared.' : 'Rescaled to the values in the current step.'}</p>
          </div>
        )}
      </Block>

      <Block label="Show">
        {is3d && (
          <>
            <Switch label="Cutting plane" checked={display.slice} onChange={(slice) => setDisplay({ slice })} />
            {display.slice && (
              <div className="mb-2 mt-1 border-l-[3px] border-line pl-3">
                <Segmented label="Plane normal" value={display.sliceAxis} onChange={(sliceAxis) => setDisplay({ sliceAxis })} options={[{ value: 0, label: 'X' }, { value: 1, label: 'Y' }, { value: 2, label: 'Z' }]} />
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="range" min={0} max={1} step={0.01} aria-label="Cutting plane position" className="cls-slider min-w-0 flex-1"
                    style={{ '--pct': `${display.slicePosition * 100}%` } as React.CSSProperties}
                    value={display.slicePosition} onChange={(e) => setDisplay({ slicePosition: Number(e.target.value) })}
                  />
                  <span className="t-mono w-9 text-right text-[12px] text-ink-3">{Math.round(display.slicePosition * 100)}%</span>
                </div>
              </div>
            )}
          </>
        )}
        <Switch label="Velocity vectors" checked={display.vectors} onChange={(vectors) => setDisplay({ vectors })} />
        <Switch label="Mesh edges" checked={display.edges} onChange={(edges) => setDisplay({ edges })} disabled={is3d && display.slice} />
      </Block>

      {info.range && (
        <Block label="Range shown">
          <Fact label="Minimum" value={formatNumber(info.range[0], 4)} unit={meta(display.field).unit !== '–' ? meta(display.field).unit : undefined} />
          <Fact label="Maximum" value={formatNumber(info.range[1], 4)} unit={meta(display.field).unit !== '–' ? meta(display.field).unit : undefined} />
        </Block>
      )}
    </Frame>
  )
}
