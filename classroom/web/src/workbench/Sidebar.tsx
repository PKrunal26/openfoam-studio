import type { ReactNode } from 'react'
import { Box, FileCode, Play, Trash2, X } from 'lucide-react'
import { isActive, type RunView } from '@c/api'
import { useWorkbench, type Selection } from '@c/store'
import { Button, Notice, Tag, cn, formatDuration } from '@c/ui/primitives'
import { ItemIcon, SECTION_LABELS, SECTION_ORDER, StatusBlock, statusText } from './icons'

const STAGE_LABEL = { mesh: 'Meshing', initialise: 'Initialising', solve: 'Solving', export: 'Exporting' } as const

function Group({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="pb-3">
      <div className="flex h-9 items-end justify-between px-4 pb-1.5">
        <h2 className="t-eyebrow">{label}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Row({ icon, label, selected, onClick, trailing, indent, title }: {
  icon?: ReactNode; label: ReactNode; selected?: boolean; onClick: () => void; trailing?: ReactNode; indent?: boolean; title?: string
}) {
  return (
    <div className={cn('group relative flex h-8 items-center', selected ? 'bg-primary-tint' : 'hover:bg-wash')}>
      {selected && <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" />}
      <button type="button" title={title} aria-current={selected ? 'true' : undefined} onClick={onClick} className={cn('flex h-full min-w-0 flex-1 items-center gap-2.5 pr-2 text-left text-[13.5px]', indent ? 'pl-9' : 'pl-4', selected && 'font-medium')}>
        {icon && <span className={cn('flex w-4 shrink-0 justify-center', selected ? 'text-primary-ink' : 'text-ink-3')}>{icon}</span>}
        <span className="truncate">{label}</span>
      </button>
      {trailing && <span className="flex shrink-0 items-center pr-2.5">{trailing}</span>}
    </div>
  )
}

/** Marks a setting that differs from the reference. */
function Changed() {
  return <span className="h-2 w-2 bg-v4 outline outline-1 outline-[#c9b700]" title="Changed from the reference" />
}

function runDetail(run: RunView): string | null {
  if (run.job?.state === 'queued') return run.job.position > 1 ? `Queued, ${run.job.position - 1} ahead` : 'Queued, next'
  if (run.job?.state === 'running') {
    const stage = run.job.stage ? STAGE_LABEL[run.job.stage] : 'Starting'
    return run.job.stage === 'solve' ? `${stage} ${Math.round(run.job.progress * 100)}%` : stage
  }
  if (run.status === 'succeeded' && run.result) return formatDuration(run.result.durationMs)
  return run.status === 'succeeded' ? null : statusText(run.status)
}

export function Sidebar({ onRun, runState }: { onRun: () => void; runState: { kind: 'run' | 'view' | 'busy' | 'disabled'; reason: string } }) {
  const tutorial = useWorkbench((state) => state.tutorial)!
  const workspace = useWorkbench((state) => state.workspace)!
  const selection = useWorkbench((state) => state.selection)
  const select = useWorkbench((state) => state.select)
  const deleteRun = useWorkbench((state) => state.deleteRun)
  const cancelRun = useWorkbench((state) => state.cancelRun)
  const selectedItem = selection.kind === 'item' ? selection.itemId : null
  const sections = SECTION_ORDER.map((node) => tutorial.sections.find((section) => section.node === node)).filter((section) => !!section)
  const changed = new Set(workspace.changed)
  const modifications = workspace.changed.length + workspace.overrides.length
  const warnings = workspace.issues.filter((issue) => issue.level === 'warning')
  const errors = workspace.issues.filter((issue) => issue.level === 'error')

  const openRun = (run: RunView) => {
    const view: Selection = { kind: 'run', runId: run.id, view: run.status === 'succeeded' ? 'fields' : 'log' }
    select(selection.kind === 'run' && selection.runId === run.id ? selection : view)
  }

  return (
    <nav className="flex h-full w-[272px] shrink-0 flex-col border-r" aria-label="Case">
      <div className="min-h-0 flex-1 overflow-y-auto pt-2">
        <Group label="Geometry">
          <Row icon={<Box size={15} strokeWidth={1.75} />} label={tutorial.geometry.name} selected={selection.kind === 'geometry'} onClick={() => select({ kind: 'geometry' })} />
        </Group>

        <Group label="Setup">
          {sections.map((section) => {
            const single = section.items.length === 1 && section.node !== 'boundaryConditions' && section.node !== 'materials'
            if (single) {
              const item = section.items[0]!
              return (
                <Row
                  key={section.node} icon={<ItemIcon icon={item.icon} />} label={SECTION_LABELS[section.node]} selected={selectedItem === item.id}
                  onClick={() => select({ kind: 'item', itemId: item.id })} trailing={(item.params ?? []).some((id) => changed.has(id)) && <Changed />}
                />
              )
            }
            return (
              <div key={section.node}>
                <div className="flex h-8 items-center pl-4 text-[13.5px] text-ink-3">{SECTION_LABELS[section.node]}</div>
                {section.items.map((item) => (
                  <Row
                    key={item.id} indent icon={<ItemIcon icon={item.icon} />} label={item.label} selected={selectedItem === item.id}
                    onClick={() => select({ kind: 'item', itemId: item.id })} trailing={(item.params ?? []).some((id) => changed.has(id)) && <Changed />}
                  />
                ))}
              </div>
            )
          })}
          <Row
            icon={<FileCode size={15} strokeWidth={1.75} />} label="Case files" title="The OpenFOAM dictionaries generated from these settings"
            selected={selection.kind === 'files'} onClick={() => select({ kind: 'files' })} trailing={workspace.overrides.length > 0 && <Changed />}
          />
        </Group>

        <Group label="Runs" action={<span className="font-mono text-[11px] text-ink-4">{workspace.limits.runsUsed}/{workspace.limits.maxRuns}</span>}>
          {workspace.runs.map((run) => {
            const selected = selection.kind === 'run' && selection.runId === run.id
            const detail = runDetail(run)
            return (
              <div key={run.id} className="relative">
                <Row
                  icon={<StatusBlock status={run.status} size={15} />} selected={selected} onClick={() => openRun(run)}
                  label={<span className="flex items-center gap-2">{run.isReference ? 'Run 1' : run.label}{run.isReference && <Tag>Reference</Tag>}</span>}
                  trailing={(
                    <>
                      {detail && <span className={cn('font-mono text-[11px] text-ink-3', !run.isReference && 'group-hover:hidden')}>{detail}</span>}
                      {!run.isReference && (isActive(run.status) ? (
                        <button type="button" aria-label={`Cancel ${run.label}`} title="Cancel this run" className="hidden h-6 w-6 items-center justify-center text-ink-3 hover:text-bad group-hover:flex" onClick={() => void cancelRun(run.id)}><X size={14} /></button>
                      ) : (
                        <button type="button" aria-label={`Delete ${run.label}`} title="Delete this run" className="hidden h-6 w-6 items-center justify-center text-ink-3 hover:text-bad group-hover:flex" onClick={() => { if (window.confirm(`Delete ${run.label}? Its results are removed from your workspace.`)) void deleteRun(run.id) }}><Trash2 size={13} /></button>
                      ))}
                    </>
                  )}
                />
                {run.job?.state === 'running' && (
                  <div className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden bg-wash-2">
                    {run.job.stage === 'solve'
                      ? <div className="h-full bg-primary transition-[width] duration-700" style={{ width: `${Math.max(3, run.job.progress * 100)}%` }} />
                      : <div className="cls-indeterminate h-full w-1/3 bg-primary" />}
                  </div>
                )}
              </div>
            )
          })}
        </Group>
      </div>

      <div className="shrink-0 space-y-2.5 border-t p-4">
        {errors.map((issue) => <Notice key={issue.message} tone="error">{issue.message}</Notice>)}
        {warnings.map((issue) => <Notice key={issue.message} tone="warning">{issue.message}</Notice>)}
        <Button variant="primary" className="w-full justify-between" disabled={runState.kind !== 'run'} onClick={onRun} title={runState.reason}>
          {runState.kind === 'busy' ? 'Running' : modifications > 0 ? `Run with ${modifications} ${modifications === 1 ? 'change' : 'changes'}` : 'Run simulation'}
          <Play size={14} />
        </Button>
        {runState.kind !== 'run' && <p className="text-[12px] leading-snug text-ink-3">{runState.kind === 'view' ? 'Change a setting to start a new run. Results for the current settings already exist.' : runState.reason}</p>}
      </div>
    </nav>
  )
}
