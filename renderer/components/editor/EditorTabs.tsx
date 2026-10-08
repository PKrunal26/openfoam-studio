import { lazy, Suspense, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useEditorStore } from '@/store/useEditorStore'
import { useProjectStore } from '@/store/useProjectStore'
import { tabIcon } from './tabIcons'
const CaseFileTab = lazy(() => import('./tabs/CaseFileTab').then((m) => ({ default: m.CaseFileTab })))
const GeometryTab = lazy(() => import('./tabs/GeometryTab').then((m) => ({ default: m.GeometryTab })))
import { LogsTab } from './tabs/LogsTab'
import { ParametersTab } from './tabs/ParametersTab'
const ResultsTab = lazy(() => import('./tabs/results/ResultsTab').then((m) => ({ default: m.ResultsTab })))

export function EditorTabs() {
  const project = useProjectStore((s) => s.project)
  const tabs = useEditorStore((s) => s.tabs)
  const activeId = useEditorStore((s) => s.activeId)
  const setActive = useEditorStore((s) => s.setActive)
  const closeTab = useEditorStore((s) => s.closeTab)

  useEffect(() => { if (project?.example && tabs.length === 0) useEditorStore.getState().openSpecialTab('visualization', 'Results') }, [project?.id])
  const active = tabs.find((t) => t.id === activeId)

  return (
    <div className="flex h-full flex-col bg-background">
      <div role="tablist" aria-label="Case workbench" className="flex h-9 shrink-0 items-center overflow-x-auto border-b scrollbar-hidden">
        {tabs.length === 0 ? (
          <div className="px-3 text-[11px] text-muted-foreground">
            Open a file from the sidebar to start editing.
          </div>
        ) : (
          tabs.map((tab) => {
            const Icon = tabIcon[tab.kind]
            const isActive = tab.id === activeId
            const dirty = tab.kind === 'case' && tab.content !== tab.savedContent && tab.savedContent != null
            return (
              <div
                key={tab.id}
                role="presentation"
                className={cn(
                  'group flex h-9 shrink-0 items-center gap-1.5 border-r px-3 text-xs',
                  isActive
                    ? 'bg-background text-foreground'
                    : 'cursor-pointer bg-sidebar/40 text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <button role="tab" aria-selected={isActive} aria-controls="workbench-panel" onClick={() => setActive(tab.id)} onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const next = tabs[(tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; if (next) { setActive(next.id); (e.currentTarget.closest('[role="tablist"]')?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[tabs.indexOf(next)])?.focus() } } }} className="max-w-[160px] truncate">{tab.label}{dirty ? ' (unsaved)' : ''}</button>
                {dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.id)
                  }}
                  className="ml-1 flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground opacity-0 focus-visible:opacity-100 hover:bg-accent hover:text-foreground group-hover:opacity-100"
                  aria-label={`Close ${tab.label}`} title="Close"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )
          })
        )}
      </div>

      <div id="workbench-panel" role="tabpanel" className="flex-1 min-h-0"><Suspense fallback={<div className="p-6 text-xs text-muted-foreground">Loading workspace…</div>}>
        {active?.kind === 'case' && project ? (
          <CaseFileTab tab={active} projectId={project.id} />
        ) : active?.kind === 'logs' ? (
          <LogsTab />
        ) : active?.kind === 'parameters' ? (
          <ParametersTab />
        ) : active?.kind === 'geometry' ? (
          <GeometryTab />
        ) : active?.kind === 'visualization' ? (
          <ResultsTab />
        ) : (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            <div>
              <h2 className="text-lg font-medium text-foreground">Review your simulation</h2>
              <p className="mt-1 text-[11px]">
                {project?.prompt || 'Start with the supported cavity case, or describe a simulation to the assistant.'}
              </p>
              <div className="mx-auto mt-6 grid max-w-sm gap-3 text-left text-xs">
                <p>1. Review geometry, boundary conditions, and fluid properties.</p>
                <p>2. Save changes and run. The solver checks the mesh before solving.</p>
                <p>3. Inspect logs and velocity results; completion alone is not physics validation.</p>
                <button className="mt-2 rounded border px-3 py-2 text-foreground hover:bg-accent" onClick={() => useEditorStore.getState().openSpecialTab('parameters', 'Parameters')}>Review parameters</button>
              </div>
            </div>
          </div>
        )}
      </Suspense></div>
    </div>
  )
}
