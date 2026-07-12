import { useEffect, useState } from 'react'
import { useHealthLifecycle } from '@/hooks/useHealthLifecycle'
import { TopBar } from '@/components/topbar/TopBar'
import { ActivityBar } from '@/components/activity/ActivityBar'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { EditorTabs } from '@/components/editor/EditorTabs'
import { AIPanel } from '@/components/ai/AIPanel'
import { ProjectGrid } from '@/components/home/ProjectGrid'
import { SettingsModal } from '@/components/settings/SettingsModal'
import { SetupModal } from '@/components/setup/SetupModal'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { useLayoutStore } from '@/store/useLayoutStore'
import { useProjectStore } from '@/store/useProjectStore'
import { useEditorStore } from '@/store/useEditorStore'
import { useChatStore } from '@/store/useChatStore'
import { useRunsStore } from '@/store/useRunsStore'
import { useRoute, navigate } from '@/lib/router'

export default function App() {
  const route = useRoute()
  const sidebarCollapsed = useLayoutStore((s) => s.sidebarCollapsed)
  const aiPanelCollapsed = useLayoutStore((s) => s.aiPanelCollapsed)
  const toggleAIPanel = useLayoutStore((s) => s.toggleAIPanel)
  const project = useProjectStore((s) => s.project)
  const loadProject = useProjectStore((s) => s.loadProject)
  const clearProject = useProjectStore((s) => s.clear)
  const resetEditor = useEditorStore((s) => s.reset)
  const openSpecialTab = useEditorStore((s) => s.openSpecialTab)
  const resetChat = useChatStore((s) => s.reset)
  const streaming = useChatStore((s) => s.streaming)
  const startRun = useRunsStore((s) => s.startRun)
  const cancelRun = useRunsStore((s) => s.cancel)
  const resetRuns = useRunsStore((s) => s.reset)
  const runStatus = useRunsStore((s) => s.status)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const { health, checkNow } = useHealthLifecycle()

  // Load project when route changes; clear when leaving.
  useEffect(() => {
    if (route.name === 'project') {
      // Reset per-project state first so switching directly between projects
      // (project→project hash change) doesn't leak the previous project's
      // editor tabs, chat, or run state.
      resetEditor()
      resetChat()
      resetRuns()
      loadProject(route.id)
    } else {
      clearProject()
      resetEditor()
      resetChat()
      resetRuns()
    }
  }, [
    route.name,
    route.name === 'project' ? route.id : null,
    loadProject,
    clearProject,
    resetEditor,
    resetChat,
    resetRuns,
  ])

  const onGenerate = () => {
    if (aiPanelCollapsed) toggleAIPanel()
    requestAnimationFrame(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        'aside textarea[placeholder^="Describe"], aside textarea[placeholder^="Open"]',
      )
      ta?.focus()
    })
  }

  const onRun = () => {
    if (!project) return
    openSpecialTab('logs', 'Logs')
    startRun(project.id)
  }

  if (health && !health.ok) {
    return <SetupModal health={health} onRecheck={checkNow} />
  }

  if (route.name === 'home') {
    return (
      <>
        <ProjectGrid onOpenSettings={() => setSettingsOpen(true)} />
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </>
    )
  }

  return (
    <div className="flex h-full w-full flex-col">
      <TopBar
        projectName={project?.name ?? 'Loading…'}
        solver="foamRun"
        onBack={() => navigate({ name: 'home' })}
        onGenerate={project ? onGenerate : undefined}
        generating={!!streaming}
        onRun={project ? onRun : undefined}
        onCancelRun={cancelRun}
        running={runStatus === 'running'}
      />

      <div className="flex flex-1 min-h-0">
        <ActivityBar onOpenSettings={() => setSettingsOpen(true)} />

        <div className="flex-1 min-w-0">
          <ResizablePanelGroup direction="horizontal">
            {!sidebarCollapsed && (
              <>
                <ResizablePanel defaultSize={18} minSize={12} maxSize={36}>
                  <Sidebar />
                </ResizablePanel>
                <ResizableHandle />
              </>
            )}

            <ResizablePanel defaultSize={aiPanelCollapsed ? 82 : 56} minSize={30}>
              <EditorTabs />
            </ResizablePanel>

            {!aiPanelCollapsed && (
              <>
                <ResizableHandle />
                <ResizablePanel defaultSize={26} minSize={18} maxSize={42}>
                  <AIPanel />
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </div>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
