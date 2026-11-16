import { useEffect } from 'react'
import { ArrowLeft, BookOpen, Layers, Play, RotateCcw } from 'lucide-react'
import { isActive } from '@c/api'
import { navigate } from '@c/router'
import { useWorkbench } from '@c/store'
import { Badge, Button, Logo, Notice, Spinner, cn, formatNumber } from '@c/ui/primitives'
import { ComputeChip, UserMenu } from './Dashboard'
import { CaseFilesView } from '@c/workbench/CaseFilesView'
import { ConvergenceView } from '@c/workbench/ConvergenceView'
import { GuidePanel } from '@c/workbench/GuidePanel'
import { JobStatus } from '@c/workbench/JobStatus'
import { LogView } from '@c/workbench/LogView'
import { RunSettingsView } from '@c/workbench/RunSettingsView'
import { SimTree } from '@c/workbench/SimTree'
import { ViewportArea } from '@c/workbench/ViewportArea'

/** What the Run button should do for the current settings. */
function useRunAction() {
  const workspace = useWorkbench((state) => state.workspace)
  const starting = useWorkbench((state) => state.starting)
  if (!workspace) return { kind: 'disabled' as const, reason: '' }
  const blocking = workspace.issues.find((issue) => issue.level === 'error')
  const active = workspace.runs.find((run) => !run.isReference && isActive(run.status))
  const match = workspace.runs.find((run) => run.id === workspace.matchesRun)
  if (starting) return { kind: 'busy' as const, reason: 'Starting…' }
  if (active) return { kind: 'busy' as const, reason: `${active.label} is ${active.status === 'queued' ? 'queued' : 'running'}` }
  if (blocking) return { kind: 'disabled' as const, reason: blocking.message }
  if (match && !['cancelled', 'error', 'interrupted', 'missing'].includes(match.status)) return { kind: 'view' as const, run: match, reason: `${match.isReference ? 'The reference solution' : match.label} already has results for these settings` }
  return { kind: 'run' as const, reason: 'Solve the case with your current settings' }
}

export function Workbench({ tutorialId }: { tutorialId: string }) {
  const { tutorial, workspace, loading, loadError, selection, guideOpen } = useWorkbench()
  const load = useWorkbench((state) => state.load)
  const poll = useWorkbench((state) => state.poll)
  const select = useWorkbench((state) => state.select)
  const startRun = useWorkbench((state) => state.startRun)
  const resetAll = useWorkbench((state) => state.resetAll)
  const setGuideOpen = useWorkbench((state) => state.setGuideOpen)
  const action = useRunAction()

  useEffect(() => { void load(tutorialId) }, [tutorialId, load])

  const anyActive = !!workspace?.runs.some((run) => isActive(run.status))
  useEffect(() => {
    if (!anyActive) return
    const timer = setInterval(() => void poll(), 1200)
    return () => clearInterval(timer)
  }, [anyActive, poll])

  useEffect(() => { document.title = tutorial ? `${tutorial.title} · OpenFOAM Studio Classroom` : 'OpenFOAM Studio Classroom' }, [tutorial])

  if (loading || (!tutorial && !loadError)) {
    return <div className="flex h-full items-center justify-center gap-3 text-muted-foreground"><Spinner size={20} /> Opening tutorial…</div>
  }
  if (loadError || !tutorial || !workspace) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-[17px] font-bold">This tutorial could not be opened</p>
        <p className="text-muted-foreground">{loadError}</p>
        <Button onClick={() => navigate('/')}><ArrowLeft size={16} /> Back to tutorials</Button>
      </div>
    )
  }

  const run = selection.kind === 'run' ? workspace.runs.find((candidate) => candidate.id === selection.runId) : undefined
  const fieldsView = selection.kind === 'run' && selection.view === 'fields' && run?.status === 'succeeded'
  const viewportVisible = selection.kind === 'geometry' || selection.kind === 'item' || fieldsView
  const modifications = workspace.changed.length + workspace.overrides.length
  const warnings = workspace.issues.filter((issue) => issue.level === 'warning')
  const errors = workspace.issues.filter((issue) => issue.level === 'error')
  const statusRun = run ?? workspace.runs[0]!

  const onRun = () => {
    if (action.kind === 'run') void startRun()
    else if (action.kind === 'view') select({ kind: 'run', runId: action.run.id, view: action.run.status === 'succeeded' ? 'fields' : 'log' })
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[58px] shrink-0 items-center gap-3 border-b bg-white px-3.5">
        <button type="button" className="flex items-center gap-2 rounded-md p-1 hover:bg-muted" onClick={() => navigate('/')} title="Back to all tutorials" aria-label="Back to all tutorials">
          <Logo size={36} />
        </button>
        <h1 className="min-w-0 truncate text-[19px] font-bold">Tutorial {tutorial.order}: {tutorial.title}</h1>
        <Badge tone="violet">{tutorial.dimension} · {tutorial.solver}</Badge>
        <div className="flex-1" />
        {modifications > 0 && (
          <button type="button" className="hidden h-9 items-center gap-1.5 rounded-md px-2.5 text-[14px] text-[#4b5661] hover:bg-muted lg:flex" onClick={() => { if (window.confirm('Reset every setting and edited file to the reference setup? Your runs are kept.')) void resetAll() }} title="Reset all settings to the reference setup">
            <RotateCcw size={15} /> Reset {modifications} {modifications === 1 ? 'change' : 'changes'}
          </button>
        )}
        {action.kind === 'view' ? (
          <Button onClick={onRun} title={action.reason}><Layers size={16} /> View results</Button>
        ) : (
          <Button variant="primary" onClick={onRun} disabled={action.kind !== 'run'} title={action.reason}>
            {action.kind === 'busy' ? <Spinner size={15} /> : <Play size={15} />} Run simulation
          </Button>
        )}
        <span className="mx-0.5 h-7 w-px bg-border" />
        <ComputeChip />
        <button
          type="button" aria-pressed={guideOpen} onClick={() => setGuideOpen(!guideOpen)}
          className={cn('flex h-9.5 items-center gap-2 rounded-md border px-3.5 text-[14.5px] font-bold', guideOpen ? 'border-[#9bd3ec] bg-accent text-accent-foreground' : 'border-input bg-white hover:bg-muted')}
        >
          <BookOpen size={16} /> Guide
        </button>
        <UserMenu />
      </header>

      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <div className="flex w-[318px] shrink-0 flex-col gap-3">
          <div className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
            <SimTree onRun={onRun} canRun={action.kind === 'run'} />
            {(errors.length > 0 || warnings.length > 0 || (modifications > 0 && action.kind === 'run')) && (
              <div className="shrink-0 space-y-2 border-t bg-[#fafbfc] p-3">
                {errors.map((issue) => <Notice key={issue.message} tone="error">{issue.message}</Notice>)}
                {warnings.map((issue) => <Notice key={issue.message} tone="warning">{issue.message}</Notice>)}
                {errors.length === 0 && action.kind === 'run' && modifications > 0 && (
                  <Button variant="primary" className="w-full" onClick={onRun}><Play size={15} /> Run with {modifications} {modifications === 1 ? 'change' : 'changes'}</Button>
                )}
              </div>
            )}
          </div>
          <JobStatus />
        </div>

        <main className="panel relative min-w-0 flex-1 overflow-hidden bg-[#f3f4f6]">
          <ViewportArea hidden={!viewportVisible} />
          {!viewportVisible && (
            <div className="absolute inset-0 bg-[#f6f7f9]">
              {selection.kind === 'files' && <CaseFilesView initialPath={selection.path} />}
              {run && selection.kind === 'run' && selection.view === 'convergence' && <ConvergenceView run={run} />}
              {run && selection.kind === 'run' && selection.view === 'log' && <LogView run={run} />}
              {run && selection.kind === 'run' && selection.view === 'settings' && <RunSettingsView key={run.id} run={run} />}
              {run && selection.kind === 'run' && selection.view === 'fields' && run.status !== 'succeeded' && (
                <div className="flex h-full items-center justify-center">
                  <div className="panel max-w-[440px] p-6 text-center">
                    <p className="text-[17px] font-bold">{isActive(run.status) ? 'Results appear when the run finishes' : 'This run has no results'}</p>
                    <p className="mt-1.5 text-[14.5px] text-muted-foreground">{run.reason ?? 'Follow the solver log while it runs.'}</p>
                    <Button className="mt-4" onClick={() => select({ kind: 'run', runId: run.id, view: 'log' })}>Open solver log</Button>
                  </div>
                </div>
              )}
              {selection.kind === 'run' && !run && <div className="flex h-full items-center justify-center text-muted-foreground">This run no longer exists.</div>}
            </div>
          )}
        </main>

        {guideOpen && <GuidePanel />}
      </div>

      <footer className="flex h-[30px] shrink-0 items-center gap-5 bg-[#262c34] px-4 text-[12.5px] text-[#c9d1d9]">
        <span>OpenFOAM 13 · {tutorial.solver}</span>
        <span className="text-[#8d9aa7]">|</span>
        <span>{statusRun.isReference ? 'Reference' : statusRun.label}: {statusRun.result?.cells ? `${statusRun.result.cells.toLocaleString()} cells` : '–'}{statusRun.result?.finalTime != null ? ` · ${tutorial.run.steady ? 'iteration' : 't ='} ${formatNumber(statusRun.result.finalTime, 5)}${tutorial.run.steady ? '' : ' s'}` : ''}</span>
        <div className="flex-1" />
        <span>{workspace.limits.runsUsed}/{workspace.limits.maxRuns} runs kept · {workspace.limits.runsToday}/{workspace.limits.maxRunsPerDay} solved today</span>
        <span className="rounded-full border border-[#5d6975] px-2.5 py-px text-[#c9d1d9]">Educational use</span>
      </footer>
    </div>
  )
}
