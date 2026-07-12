import { Files, Terminal, History, Settings, PanelRight, Sliders, Box, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useLayoutStore, type SidebarSection } from '@/store/useLayoutStore'
import { useEditorStore } from '@/store/useEditorStore'

interface ActivityItem {
  id: SidebarSection
  label: string
  Icon: React.ComponentType<{ className?: string }>
}

const items: ActivityItem[] = [
  { id: 'files', label: 'Files', Icon: Files },
  { id: 'commands', label: 'Commands', Icon: Terminal },
  { id: 'runs', label: 'Runs', Icon: History },
]

export function ActivityBar({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { activeSection, sidebarCollapsed, setActiveSection, toggleAIPanel } = useLayoutStore()
  const openSpecialTab = useEditorStore((s) => s.openSpecialTab)
  const activeId = useEditorStore((s) => s.activeId)
  const parametersActive = activeId === 'special:parameters'
  const geometryActive = activeId === 'special:geometry'
  const resultsActive = activeId === 'special:visualization'

  return (
    <nav
      className={cn(
        'flex h-full w-12 shrink-0 flex-col items-center justify-between border-r bg-sidebar py-2',
      )}
      aria-label="Activity bar"
    >
      <ul className="flex flex-col items-center gap-0.5">
        {items.map(({ id, label, Icon }) => {
          const active = activeSection === id && !sidebarCollapsed
          return (
            <li key={id}>
              <button
                title={label}
                onClick={() => setActiveSection(id)}
                className={cn(
                  'group relative flex h-9 w-9 items-center justify-center rounded-md transition-colors',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-sm bg-foreground" />
                )}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="flex flex-col items-center gap-0.5">
        <button
          title="Parameters"
          onClick={() => openSpecialTab('parameters', 'Parameters')}
          className={cn(
            'group relative flex h-9 w-9 items-center justify-center rounded-md transition-colors',
            parametersActive
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
          )}
        >
          <Sliders className="h-[18px] w-[18px]" />
          {parametersActive && (
            <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-sm bg-foreground" />
          )}
        </button>
        <button
          title="Geometry"
          onClick={() => openSpecialTab('geometry', 'Geometry')}
          className={cn(
            'group relative flex h-9 w-9 items-center justify-center rounded-md transition-colors',
            geometryActive
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
          )}
        >
          <Box className="h-[18px] w-[18px]" />
          {geometryActive && (
            <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-sm bg-foreground" />
          )}
        </button>
        <button
          title="Results"
          onClick={() => openSpecialTab('visualization', 'Results')}
          className={cn(
            'group relative flex h-9 w-9 items-center justify-center rounded-md transition-colors',
            resultsActive
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
          )}
        >
          <BarChart3 className="h-[18px] w-[18px]" />
          {resultsActive && (
            <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-sm bg-foreground" />
          )}
        </button>
        <button
          title="Toggle assistant panel"
          onClick={toggleAIPanel}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
        >
          <PanelRight className="h-[18px] w-[18px]" />
        </button>
        <button
          title="Settings"
          onClick={onOpenSettings}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
        >
          <Settings className="h-[18px] w-[18px]" />
        </button>
      </div>
    </nav>
  )
}
