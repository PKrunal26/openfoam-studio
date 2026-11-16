import { useState, type ReactNode } from 'react'
import {
  ChartLine, ChevronDown, ChevronRight, Cuboid, FileCode, Layers, Plus, ScrollText, SlidersHorizontal, Trash2,
} from 'lucide-react'
import { isActive, type RunView } from '@c/api'
import { useWorkbench, type RunViewKind, type Selection } from '@c/store'
import { cn } from '@c/ui/primitives'
import { ItemIcon, RunStatusIcon, SECTION_LABELS, SECTION_ORDER, Tick } from './icons'

function Row({ depth, icon, label, selected, onClick, trailing, expanded, onToggle, title, bold }: {
  depth: number
  icon?: ReactNode
  label: ReactNode
  selected?: boolean
  onClick?: () => void
  trailing?: ReactNode
  /** undefined = leaf */
  expanded?: boolean
  onToggle?: () => void
  title?: string
  bold?: boolean
}) {
  return (
    <div
      className={cn('group relative flex h-[38px] shrink-0 items-center pr-2 text-[15px]', selected ? 'bg-accent text-accent-foreground' : 'hover:bg-[#f1f4f6]')}
      style={{ paddingLeft: 10 + depth * 20 }}
    >
      {expanded !== undefined ? (
        <button type="button" aria-label={expanded ? 'Collapse' : 'Expand'} className="mr-0.5 flex h-6 w-5 shrink-0 items-center justify-center rounded text-[#77838f] hover:bg-[#dfe5ea]" onClick={onToggle}>
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
      ) : <span className="mr-0.5 w-5 shrink-0" />}
      <button type="button" title={title} onClick={onClick ?? onToggle} className={cn('flex h-full min-w-0 flex-1 items-center gap-2 text-left', bold && 'font-bold')}>
        {icon && <span className="flex w-[18px] shrink-0 justify-center">{icon}</span>}
        <span className="truncate">{label}</span>
      </button>
      {trailing}
    </div>
  )
}

function Dot() {
  return <span className="mr-1 h-2 w-2 shrink-0 rounded-full bg-accent-strong" title="Changed from the reference" />
}

const RUN_VIEWS: { view: RunViewKind; label: string; icon: ReactNode }[] = [
  { view: 'settings', label: 'Settings', icon: <SlidersHorizontal size={16} /> },
  { view: 'convergence', label: 'Convergence plots', icon: <ChartLine size={16} /> },
  { view: 'fields', label: 'Solution fields', icon: <Layers size={16} className="text-accent-strong" /> },
  { view: 'log', label: 'Solver log', icon: <ScrollText size={16} /> },
]

export function SimTree({ onRun, canRun }: { onRun: () => void; canRun: boolean }) {
  const tutorial = useWorkbench((state) => state.tutorial)!
  const workspace = useWorkbench((state) => state.workspace)!
  const selection = useWorkbench((state) => state.selection)
  const select = useWorkbench((state) => state.select)
  const deleteRun = useWorkbench((state) => state.deleteRun)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const isOpen = (key: string, fallback = true) => !(collapsed[key] ?? !fallback)
  const toggle = (key: string, fallback = true) => setCollapsed((state) => ({ ...state, [key]: isOpen(key, fallback) }))
  const selectedItem = selection.kind === 'item' ? selection.itemId : null
  const sections = SECTION_ORDER.map((node) => tutorial.sections.find((section) => section.node === node)).filter((section) => !!section)
  const changed = new Set(workspace.changed)

  const runRows = (run: RunView) => {
    const key = `run:${run.id}`
    const selectedRun = selection.kind === 'run' && selection.runId === run.id
    // The run you are looking at stays open; others start collapsed except the newest.
    const open = isOpen(key, selectedRun || run.id === workspace.runs[workspace.runs.length - 1]!.id)
    const hasResults = run.status === 'succeeded'
    const defaultView: Selection = { kind: 'run', runId: run.id, view: hasResults ? 'fields' : 'log' }
    return (
      <div key={run.id}>
        <Row
          depth={2} expanded={open} onToggle={() => toggle(key, open)} onClick={() => { if (!open) toggle(key, open); select(defaultView) }}
          icon={<RunStatusIcon status={run.status} size={17} />}
          label={run.isReference ? <>Run 1 <span className="text-muted-foreground">· Reference</span></> : run.label}
          title={run.isReference ? 'The pre-solved reference solution' : undefined}
          trailing={!run.isReference && (
            <button
              type="button" aria-label={`Delete ${run.label}`} title={isActive(run.status) ? 'Cancel and delete this run' : 'Delete this run'}
              className="hidden h-7 w-7 items-center justify-center rounded text-[#77838f] hover:bg-[#dfe5ea] hover:text-danger group-hover:flex"
              onClick={() => { if (window.confirm(`Delete ${run.label}? Its results will be removed from your workspace.`)) void deleteRun(run.id) }}
            >
              <Trash2 size={15} />
            </button>
          )}
        />
        {open && RUN_VIEWS.map(({ view, label, icon }) => {
          const disabled = (view === 'fields' && !hasResults) || (view === 'settings' && !run.result)
          return (
            <Row
              key={view} depth={3} icon={icon}
              label={<span className={cn(disabled && 'text-[#a3acb5]')}>{label}</span>}
              selected={selectedRun && selection.view === view}
              onClick={disabled ? undefined : () => select({ kind: 'run', runId: run.id, view })}
              title={disabled ? 'Available when the run has finished' : undefined}
            />
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2" role="tree">
      <div className="flex h-11 shrink-0 items-center gap-2 px-3">
        <ChevronDown size={15} className="text-[#77838f]" />
        <Cuboid size={17} className="text-[#5d6975]" />
        <span className="section-label">Geometries</span>
      </div>
      <Row depth={1} icon={<Cuboid size={16} className="text-[#5d6975]" />} label={tutorial.geometry.name} selected={selection.kind === 'geometry'} onClick={() => select({ kind: 'geometry' })} />

      <div className="mt-1.5 flex h-11 shrink-0 items-center gap-2 border-t px-3">
        <ChevronDown size={15} className="text-[#77838f]" />
        <Layers size={17} className="text-[#5d6975]" />
        <span className="section-label">Simulations</span>
      </div>
      <Row depth={0} expanded={isOpen('sim')} onToggle={() => toggle('sim')} label={tutorial.analysisType} bold title={`OpenFOAM solver module: ${tutorial.solver}`} />
      {isOpen('sim') && (
        <>
          <Row depth={1} icon={<Tick />} label="Geometry" selected={selection.kind === 'geometry'} onClick={() => select({ kind: 'geometry' })} />
          {sections.map((section) => {
            const single = section.items.length === 1 && ['numerics', 'simulationControl', 'mesh', 'initialConditions', 'model'].includes(section.node)
            if (single) {
              const item = section.items[0]!
              const modified = (item.params ?? []).some((id) => changed.has(id))
              return (
                <Row
                  key={section.node} depth={1} icon={<Tick />} label={SECTION_LABELS[section.node]}
                  selected={selectedItem === item.id} onClick={() => select({ kind: 'item', itemId: item.id })} trailing={modified && <Dot />}
                />
              )
            }
            const key = `section:${section.node}`
            return (
              <div key={section.node}>
                <Row depth={1} expanded={isOpen(key)} onToggle={() => toggle(key)} label={SECTION_LABELS[section.node]} />
                {isOpen(key) && section.items.map((item) => (
                  <Row
                    key={item.id} depth={2}
                    icon={section.node === 'boundaryConditions' ? <ItemIcon icon={item.icon} /> : <Tick />}
                    label={item.label} selected={selectedItem === item.id} onClick={() => select({ kind: 'item', itemId: item.id })}
                    trailing={(item.params ?? []).some((id) => changed.has(id)) && <Dot />}
                  />
                ))}
              </div>
            )
          })}
          <Row
            depth={1} icon={<FileCode size={16} className="text-[#5d6975]" />} label="Case files" title="The OpenFOAM dictionaries generated from these settings"
            selected={selection.kind === 'files'} onClick={() => select({ kind: 'files' })} trailing={workspace.overrides.length > 0 && <Dot />}
          />
          <Row
            depth={1} expanded={isOpen('runs')} onToggle={() => toggle('runs')} label="Simulation runs"
            trailing={(
              <button
                type="button" aria-label="New run with the current settings" title={canRun ? 'New run with the current settings' : 'Change a setting to start a new run'}
                disabled={!canRun} onClick={onRun}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-[#b9c2cb] text-[#5d6975] hover:bg-[#e9edf0] disabled:opacity-40"
              >
                <Plus size={14} />
              </button>
            )}
          />
          {isOpen('runs') && workspace.runs.map(runRows)}
        </>
      )}
    </div>
  )
}
