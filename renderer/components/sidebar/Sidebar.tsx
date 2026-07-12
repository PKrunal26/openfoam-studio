import { useLayoutStore } from '@/store/useLayoutStore'
import { FilesPanel } from './FilesPanel'
import { CommandsPanel } from './CommandsPanel'
import { RunsPanel } from './RunsPanel'

const titles = {
  files: 'Files',
  commands: 'Commands',
  runs: 'Runs',
} as const

export function Sidebar() {
  const activeSection = useLayoutStore((s) => s.activeSection)

  return (
    <aside className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-9 shrink-0 items-center border-b px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {titles[activeSection]}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-hidden">
        {activeSection === 'files' && <FilesPanel />}
        {activeSection === 'commands' && <CommandsPanel />}
        {activeSection === 'runs' && <RunsPanel />}
      </div>
    </aside>
  )
}
