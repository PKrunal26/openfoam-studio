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
import { UnsavedDialog } from '@/components/editor/UnsavedDialog'
import { useEditorStore, isDirty } from '@/store/useEditorStore'
import { useChatStore } from '@/store/useChatStore'
import { useRunsStore } from '@/store/useRunsStore'
import * as api from '@/lib/api'
import { backendFetch } from '@/lib/backendFetch'
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
  const [inspectMode, setInspectMode] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)
  const [savingRun, setSavingRun] = useState(false)
  const files = useProjectStore((s) => s.files)
  const loading = useProjectStore((s) => s.loading)
  const projectError = useProjectStore((s) => s.error)
  const tabs = useEditorStore((s) => s.tabs)

  const { health, checkNow } = useHealthLifecycle()

  useEffect(() => { useProjectStore.getState().setExecutionAllowed(health?.ok === true) }, [health?.ok])
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (useEditorStore.getState().tabs.some(isDirty)) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [])

  // Load project when route changes; clear when leaving.
  useEffect(() => {
    setRunError(null)
    setRenameOpen(false)
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

  const onRun = async () => {
    if (!project || savingRun || !health?.ok) return
    const projectId = project.id
    setSavingRun(true); setRunError(null)
    try {
      await useEditorStore.getState().saveAll(projectId)
      if (useProjectStore.getState().project?.id !== projectId) return
      openSpecialTab('logs', 'Logs')
      startRun(projectId)
    } catch (err) { if (useProjectStore.getState().project?.id === projectId) setRunError(err instanceof Error ? err.message : String(err)) }
    finally { setSavingRun(false) }
  }
  const onRename = async () => {
    if (!project || !renameValue.trim()) return
    const id = project.id
    setRenameBusy(true); setRunError(null)
    try { const renamed = await api.renameProject(id, renameValue.trim()); if (useProjectStore.getState().project?.id === id) useProjectStore.setState({ project: renamed }); setRenameOpen(false) }
    catch (err) { if (useProjectStore.getState().project?.id === id) setRunError(err instanceof Error ? err.message : String(err)) }
    finally { setRenameBusy(false) }
  }
  const onExport = async (support = false) => {
    if (!project) return
    const projectId = project.id
    try {
      const res = await backendFetch(support ? api.projectSupportUrl(project.id) : api.projectExportUrl(project.id))
      if (!res.ok) {
        const detail = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(detail?.error ?? `Export failed: ${res.status}`)
      }
      const url = URL.createObjectURL(await res.blob())
      const link = document.createElement('a'); link.href = url; link.download = `${project.name.replace(/[^a-z0-9_-]/gi, '_')}${support ? '-support' : ''}.json`; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) { if (useProjectStore.getState().project?.id === projectId) setRunError(err instanceof Error ? err.message : String(err)) }
  }
  const required = ['system/controlDict', 'system/blockMeshDict', 'system/fvSchemes', 'system/fvSolution']
  const missing = required.filter((path) => !files.some((file) => file.relPath === path))
  const runnable = !!project && !project.example && !!health?.ok && missing.length === 0 && !savingRun && !streaming && runStatus !== 'running'
  const readiness = project?.example ? 'Reference visualization · No solver or physics certification.'
    : runStatus === 'running' ? 'Run in progress · Mesh checks, solver, and result export have separate outcomes.'
    : runStatus === 'success' ? 'Run completed · Review mesh, residuals, and numerical checks. Physics benchmark is a separate validation.'
    : runStatus === 'failed' || runStatus === 'exhausted' ? 'Run failed · Review the logs and proposed recovery before trying again.'
    : runStatus === 'aborted' ? 'Run stopped · Review files and logs before restarting.'
    : missing.length ? `Case incomplete · Missing ${missing.join(', ')}.`
    : project?.status === 'done' ? 'Latest run completed · Review its numerical checks and results. Physics benchmark is a separate validation.'
    : project?.status === 'error' ? 'Latest operation failed · Review logs and recovery before trying again.'
    : project?.status === 'ready' ? 'Preflight checks passed · Review assumptions, save changes, then run the full simulation.'
    : project?.status === 'validation-failed' ? 'Validation failed · Review the assistant and logs before running.'
    : project?.status === 'needs-input' ? 'More information needed · Answer the assistant’s clarification before running.'
    : project?.status === 'interrupted' ? 'Previous operation interrupted · Review the case and logs before restarting.'
    : 'Case inputs are unvalidated · Review parameters and boundary conditions. Run checks the mesh before solving.'


  if (health && !health.ok && !inspectMode) {
    return <>
      <UnsavedDialog />
      <SetupModal health={health} onRecheck={checkNow} onOpenSettings={() => setSettingsOpen(true)} onInspect={() => setInspectMode(true)} />
      <SettingsModal open={settingsOpen} onClose={() => { setSettingsOpen(false); void checkNow() }} />
    </>
  }

  if (route.name === 'home') {
    return (
      <>
        <ProjectGrid onOpenSettings={() => setSettingsOpen(true)} inspectMode={inspectMode && !health?.ok} onOpenSetup={() => setInspectMode(false)} />
        <UnsavedDialog />
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </>
    )
  }

  return (
    <div className="flex h-full w-full flex-col">
      <TopBar
        projectName={project?.name ?? 'Loading…'}
        solver={project?.example ? 'Reference data' : 'foamRun'}
        onRename={project ? () => { setRenameValue(project.name); setRenameOpen(true) } : undefined}
        onExport={project ? () => useEditorStore.getState().guard(() => { void onExport() }) : undefined}
        onSupport={project ? () => void onExport(true) : undefined}
        onBack={() => navigate({ name: 'home' })}
        onGenerate={project && health?.ok && !project.example ? onGenerate : undefined}
        generating={!!streaming}
        onRun={runnable ? () => void onRun() : undefined}
        runLabel={savingRun ? 'Saving…' : tabs.some(isDirty) ? 'Save and run' : 'Run'}
        runHint={project?.example ? 'This is bundled reference data, not an executable case' : !health?.ok ? 'Complete setup before running' : missing.length ? `Missing required files: ${missing.join(', ')}` : undefined}
        onCancelRun={cancelRun}
        running={runStatus === 'running'}
      />

      {project && <div role="status" className="border-b bg-muted/40 px-4 py-2 text-xs leading-relaxed text-muted-foreground">{readiness}</div>}

      {renameOpen && <form onSubmit={(e) => { e.preventDefault(); void onRename() }} className="flex items-center gap-2 border-b px-3 py-2"><label htmlFor="project-name" className="text-xs">Project name</label><input id="project-name" autoFocus maxLength={120} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-xs" /><button disabled={renameBusy || !renameValue.trim()} className="rounded border px-2 py-1 text-xs">Save name</button><button type="button" onClick={() => setRenameOpen(false)} className="rounded border px-2 py-1 text-xs">Cancel</button></form>}
      {!health?.ok && <div className="flex items-center justify-between border-b bg-muted px-4 py-2 text-xs text-muted-foreground"><span>Inspect mode · Review existing files and results. Complete setup to use AI and run simulations.</span><button className="rounded border px-2 py-1" onClick={() => setInspectMode(false)}>Open setup</button></div>}
      {(runError || projectError) && <div role="alert" className="border-b p-3 text-xs text-destructive">{runError || projectError}<button className="ml-3 rounded border px-2 py-1" onClick={() => { setRunError(null); if (route.name === 'project') void loadProject(route.id) }}>Retry loading project</button></div>}
      {loading && <div role="status" className="border-b p-2 text-xs text-muted-foreground">Loading project…</div>}
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

      <UnsavedDialog />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
