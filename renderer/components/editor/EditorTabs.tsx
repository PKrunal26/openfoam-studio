import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useEditorStore } from '@/store/useEditorStore'
import { useProjectStore } from '@/store/useProjectStore'
import { tabIcon } from './tabIcons'
import { CaseFileTab } from './tabs/CaseFileTab'
import { GeometryTab } from './tabs/GeometryTab'
import { LogsTab } from './tabs/LogsTab'
import { ParametersTab } from './tabs/ParametersTab'
import { ResultsTab } from './tabs/results/ResultsTab'

export function EditorTabs() {
  const project = useProjectStore((s) => s.project)
  const tabs = useEditorStore((s) => s.tabs)
  const activeId = useEditorStore((s) => s.activeId)
  const setActive = useEditorStore((s) => s.setActive)
  const closeTab = useEditorStore((s) => s.closeTab)

  const active = tabs.find((t) => t.id === activeId)

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center overflow-x-auto border-b scrollbar-hidden">
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
                onClick={() => setActive(tab.id)}
                className={cn(
                  'group flex h-9 shrink-0 items-center gap-1.5 border-r px-3 text-xs',
                  isActive
                    ? 'bg-background text-foreground'
                    : 'cursor-pointer bg-sidebar/40 text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="max-w-[160px] truncate">{tab.label}</span>
                {dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.id)
                  }}
                  className="ml-1 flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
                  title="Close"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )
          })
        )}
      </div>

      <div className="flex-1 min-h-0">
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
              <p>Editor surface</p>
              <p className="mt-1 text-[11px]">
                Open a case file from the sidebar.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
