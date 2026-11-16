import { useEffect } from 'react'
import { ArrowLeft, BookOpen, ChevronRight, RotateCcw } from 'lucide-react'
import { isActive, type RunView } from '@c/api'
import { navigate } from '@c/router'
import { useWorkbench, type RunViewKind } from '@c/store'
import { Button, Mark, Spinner, Tag, cn, formatDuration, formatNumber, pad2 } from '@c/ui/primitives'
import { ComputeStatus, UserMenu } from './Dashboard'
import { CaseFilesView } from '@c/workbench/CaseFilesView'
import { ConvergenceView } from '@c/workbench/ConvergenceView'
import { GuidePanel } from '@c/workbench/GuidePanel'
import { GeometryInspector, ResultsInspector, SetupInspector } from '@c/workbench/Inspector'
import { LogView } from '@c/workbench/LogView'
import { RunSettingsView } from '@c/workbench/RunSettingsView'
import { Sidebar } from '@c/workbench/Sidebar'
import { ViewportArea } from '@c/workbench/ViewportArea'
import { statusText } from '@c/workbench/icons'

/** What the Run button should do for the current settings. */
function useRunState() {
  const workspace = useWorkbench((state) => state.workspace)
  const starting = useWorkbench((state) => state.starting)
  if (!workspace) return { kind: 'disabled' as const, reason: '' }
  const blocking = workspace.issues.find((issue) => issue.level === 'error')
  const active = workspace.runs.find((run) => !run.isReference && isActive(run.status))
  const match = workspace.runs.find((run) => run.id === workspace.matchesRun)
  if (starting) return { kind: 'busy' as const, reason: 'Starting the run.' }
  if (active) return { kind: 'busy' as const, reason: `${active.label} is ${active.status === 'queued' ? 'queued' : 'running'}. One run at a time.` }
  if (blocking) return { kind: 'disabled' as const, reason: 'Fix the problem above to run.' }
  if (match && !['cancelled', 'error', 'interrupted', 'missing'].includes(match.status)) return { kind: 'view' as const, reason: '' }
  return { kind: 'run' as const, reason: 'Solve the case with your current settings' }
}

const TABS: { view: RunViewKind; label: string }[] = [
  { view: 'fields', label: 'Fields' },
  { view: 'convergence', label: 'Convergence' },
  { view: 'log', label: 'Log' },
  { view: 'settings', label: 'Settings' },
]

function RunHeader({ run, view }: { run: RunView; view: RunViewKind }) {
  const steady = useWorkbench((state) => state.tutorial!.run.steady)
  const select = useWorkbench((state) => state.select)
  const tone = run.status === 'succeeded' ? 'ok' : run.status === 'failed' || run.status === 'error' ? 'bad' : run.status === 'queued' ? 'warn' : run.status === 'running' ? 'primary' : 'neutral'
  return (
    <div className="@container flex h-11 shrink-0 items-stretch border-b bg-paper pl-5">
      <div className="flex shrink-0 items-center gap-2.5 pr-4 whitespace-nowrap">
        <span className="t-title text-[15px]">{run.isReference ? 'Run 1' : run.label}</span>
        {run.isReference && <span className="hidden @xl:block"><Tag>Reference</Tag></span>}
        {run.status !== 'succeeded' && <Tag tone={tone}>{statusText(run.status)}</Tag>}
      </div>
      <div className="flex items-stretch" role="tablist" aria-label="Run views">
        {TABS.map((tab) => {
          const disabled = (tab.view === 'fields' && run.status !== 'succeeded') || (tab.view === 'settings' && !run.result)
          const selected = view === tab.view
          return (
            <button
              key={tab.view} type="button" role="tab" aria-selected={selected} disabled={disabled} title={disabled ? 'Available when the run has finished' : undefined}
              className={cn('relative px-3 text-[13.5px] whitespace-nowrap transition-colors disabled:text-ink-4', selected ? 'font-medium text-ink' : 'text-ink-3 hover:text-ink')}
              onClick={() => select({ kind: 'run', runId: run.id, view: tab.view })}
            >
              {tab.label}
              {selected && <span className="absolute inset-x-3 bottom-0 h-[3px] bg-primary" />}
            </button>
          )
        })}
      </div>
      <div className="min-w-0 flex-1" />
      {run.result && (
        <p className="t-mono hidden items-center gap-4 pr-5 text-[11.5px] whitespace-nowrap text-ink-3 @4xl:flex">
          <span>{run.result.cells?.toLocaleString() ?? '–'} cells</span>
          {run.result.finalTime != null && <span>{steady ? `${formatNumber(run.result.finalTime, 6)} iterations` : `t = ${formatNumber(run.result.finalTime, 5)} s`}</span>}
          <span>solved in {formatDuration(run.result.durationMs)}</span>
        </p>
      )}
    </div>
  )
}

export function Workbench({ tutorialId }: { tutorialId: string }) {
  const { tutorial, workspace, loading, loadError, selection, guideOpen } = useWorkbench()
  const load = useWorkbench((state) => state.load)
  const poll = useWorkbench((state) => state.poll)
  const select = useWorkbench((state) => state.select)
  const startRun = useWorkbench((state) => state.startRun)
  const resetAll = useWorkbench((state) => state.resetAll)
  const setGuideOpen = useWorkbench((state) => state.setGuideOpen)
  const runState = useRunState()

  useEffect(() => { void load(tutorialId) }, [tutorialId, load])

  const anyActive = !!workspace?.runs.some((run) => isActive(run.status))
  useEffect(() => {
    if (!anyActive) return
    const timer = setInterval(() => void poll(), 1200)
    return () => clearInterval(timer)
  }, [anyActive, poll])

  useEffect(() => { document.title = tutorial ? `${tutorial.title} · OpenFOAM Studio Classroom` : 'OpenFOAM Studio Classroom' }, [tutorial])

  if (loading || (!tutorial && !loadError)) {
    return <div className="flex h-full items-center justify-center gap-3 text-ink-3"><Spinner size={18} /> Opening tutorial</div>
  }
  if (loadError || !tutorial || !workspace) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="t-title text-[20px]">This tutorial could not be opened</p>
        <p className="text-ink-3">{loadError}</p>
        <Button onClick={() => navigate('/')}><ArrowLeft size={15} /> All tutorials</Button>
      </div>
    )
  }

  const run = selection.kind === 'run' ? workspace.runs.find((candidate) => candidate.id === selection.runId) : undefined
  const fieldsView = selection.kind === 'run' && selection.view === 'fields' && run?.status === 'succeeded'
  const viewportVisible = selection.kind === 'geometry' || selection.kind === 'item' || !!fieldsView
  const modifications = workspace.changed.length + workspace.overrides.length

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b pl-4 pr-3">
        <button type="button" className="flex h-9 items-center gap-2 pr-1 hover:opacity-70" onClick={() => navigate('/')} title="All tutorials" aria-label="All tutorials"><Mark size={26} /></button>
        <nav className="flex min-w-0 items-center gap-1.5 text-[13.5px]" aria-label="Breadcrumb">
          <button type="button" className="text-ink-3 hover:text-ink" onClick={() => navigate('/')}>Tutorials</button>
          <ChevronRight size={14} className="shrink-0 text-ink-4" />
          <span className="t-mono text-ink-3">{pad2(tutorial.order)}</span>
          <h1 className="t-title truncate text-[16px]">{tutorial.title}</h1>
        </nav>
        <span className="t-mono hidden whitespace-nowrap text-[11.5px] text-ink-3 lg:block">{tutorial.dimension} · {tutorial.solver}</span>
        <div className="flex-1" />
        {modifications > 0 && (
          <Button variant="ghost" size="sm" className="hidden md:inline-flex" onClick={() => { if (window.confirm('Reset every setting and edited file to the reference setup? Your runs are kept.')) void resetAll() }} title="Go back to the reference setup">
            <RotateCcw size={13} /> Reset {modifications} {modifications === 1 ? 'change' : 'changes'}
          </Button>
        )}
        <span className="hidden md:block"><ComputeStatus /></span>
        <Button variant={guideOpen ? 'ink' : 'outline'} size="sm" aria-pressed={guideOpen} onClick={() => setGuideOpen(!guideOpen)}><BookOpen size={14} /> Guide</Button>
        <UserMenu />
      </header>

      <div className="flex min-h-0 flex-1">
        <Sidebar runState={runState} onRun={() => { if (runState.kind === 'run') void startRun() }} />

        {selection.kind === 'geometry' && <GeometryInspector />}
        {selection.kind === 'item' && <SetupInspector itemId={selection.itemId} />}
        {fieldsView && run && <ResultsInspector runLabel={run.isReference ? 'Run 1 · Reference' : run.label} />}

        <main className="flex min-w-0 flex-1 flex-col">
          {run && selection.kind === 'run' && <RunHeader run={run} view={selection.view} />}
          <div className="relative min-h-0 flex-1">
            <ViewportArea hidden={!viewportVisible} />
            {!viewportVisible && (
              <div className="absolute inset-0 bg-paper">
                {selection.kind === 'files' && <CaseFilesView initialPath={selection.path} />}
                {run && selection.kind === 'run' && selection.view === 'convergence' && <ConvergenceView run={run} />}
                {run && selection.kind === 'run' && selection.view === 'log' && <LogView run={run} />}
                {run && selection.kind === 'run' && selection.view === 'settings' && <RunSettingsView key={run.id} run={run} />}
                {run && selection.kind === 'run' && selection.view === 'fields' && run.status !== 'succeeded' && (
                  <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                    <p className="t-title text-[18px]">{isActive(run.status) ? 'Results appear when the run finishes' : 'This run has no results'}</p>
                    <p className="max-w-[420px] text-[13.5px] text-ink-3">{run.reason ?? 'Follow the solver log while it runs.'}</p>
                    <Button className="mt-3" onClick={() => select({ kind: 'run', runId: run.id, view: 'log' })}>Open solver log</Button>
                  </div>
                )}
                {selection.kind === 'run' && !run && <div className="flex h-full items-center justify-center text-ink-3">This run no longer exists.</div>}
              </div>
            )}
          </div>
        </main>

        {guideOpen && <GuidePanel />}
      </div>
    </div>
  )
}
