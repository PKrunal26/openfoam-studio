import { useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'
import { useProjectStore } from '@/store/useProjectStore'
import { useChatStore } from '@/store/useChatStore'
import { useRunsStore } from '@/store/useRunsStore'
import { MessageBlock } from './blocks/MessageBlock'
import { ThinkingBlock } from './blocks/ThinkingBlock'
import { FilesWrittenBlock } from './blocks/FilesWrittenBlock'
import { AgentStepsBlock } from './blocks/AgentStepsBlock'
import { DiagnosisDiffBlock } from './blocks/DiagnosisDiffBlock'
import { ChatInput } from './ChatInput'

const SUGGESTIONS = [
  'Lid-driven cavity at Re=100',
  'Channel flow with a heated bottom wall',
  'Flow over a backward-facing step at Re=200',
]

export function AIPanel() {
  const project = useProjectStore((s) => s.project)
  const refreshFiles = useProjectStore((s) => s.refreshFiles)
  const messages = useChatStore((s) => s.messages)
  const streaming = useChatStore((s) => s.streaming)
  const setMessages = useChatStore((s) => s.setMessages)
  const sendPrompt = useChatStore((s) => s.sendPrompt)
  const cancel = useChatStore((s) => s.cancel)
  const clearHistory = useChatStore((s) => s.clearHistory)
  const diagnosis = useRunsStore((s) => s.diagnosis)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearError, setClearError] = useState<string | null>(null)

  // Hydrate chat from project meta whenever the project changes.
  const hydratedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!project) {
      setMessages([])
      hydratedFor.current = null
      return
    }
    if (hydratedFor.current === project.id) return
    hydratedFor.current = project.id
    const persisted = (project.messages ?? [])
      .map((m) => ({
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: m.content,
        ts: typeof m.ts === 'string' ? m.ts : typeof m.timestamp === 'string' ? m.timestamp : undefined,
        filesChanged: m.filesChanged,
        agentSteps: m.agentSteps,
      }))
      .filter((m) => m.role === 'user' || m.role === 'assistant')
    setMessages(persisted)

    // Project freshly created with an initial prompt → kick off generation once
    // so the prompt the user typed actually runs. Gate on status 'idle' (only
    // set at creation) so clearing chat history later can't silently re-trigger
    // a fresh generation on the next visit.
    const initialPrompt = project.prompt?.trim()
    if (project.status === 'idle' && persisted.length === 0 && initialPrompt) {
      sendPrompt(project.id, initialPrompt, {
        onFilesWritten: () => refreshFiles().catch(() => {}),
      })
    }
  }, [project, setMessages, sendPrompt, refreshFiles])

  // Auto-scroll on updates — but only when the user is already near the
  // bottom, so scrolling up to read history isn't hijacked mid-stream.
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedToBottom = useRef(true)
  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !pinnedToBottom.current) return
    el.scrollTop = el.scrollHeight
  }, [
    messages.length,
    streaming?.filesWritten.length,
    streaming?.elapsed,
    streaming?.agentSteps.length,
    streaming?.pendingToolCalls.length,
  ])

  const onSubmit = (prompt: string) => {
    if (!project) return
    pinnedToBottom.current = true
    sendPrompt(project.id, prompt, {
      onFilesWritten: () => {
        refreshFiles().catch(() => {})
      },
    })
  }

  const onClear = async () => {
    if (!project) return
    if (!confirmClear) {
      setConfirmClear(true)
      // Two-step confirm: quietly re-arm after a moment if not confirmed.
      setTimeout(() => setConfirmClear(false), 3000)
      return
    }
    setConfirmClear(false)
    setClearError(null)
    try {
      await clearHistory(project.id)
    } catch (err) {
      setClearError(err instanceof Error ? err.message : String(err))
    }
  }

  const empty = messages.length === 0 && !streaming && !diagnosis

  return (
    <aside className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-9 shrink-0 items-center justify-between border-b px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Assistant
        </span>
        <button
          onClick={onClear}
          disabled={messages.length === 0 || !!streaming}
          title={confirmClear ? 'Click again to clear the conversation' : 'Clear conversation'}
          className={
            confirmClear
              ? 'flex h-6 items-center gap-1 rounded-md border border-destructive/50 bg-destructive/10 px-1.5 text-[10px] font-medium text-destructive'
              : 'flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent'
          }
        >
          <Eraser className="h-3.5 w-3.5" />
          {confirmClear && 'Clear?'}
        </button>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 py-3">
        {clearError && (
          <div className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
            Failed to clear history: {clearError}
          </div>
        )}
        {empty ? (
          <div className="text-xs text-muted-foreground">
            <p>No conversation yet.</p>
            <p className="mt-1 text-[11px] leading-relaxed">
              Describe your simulation in plain English. The assistant will generate
              the OpenFOAM case files, mesh the geometry, and smoke-test the solver.
            </p>
            {project && (
              <div className="mt-3 grid gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => onSubmit(s)}
                    className="rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5 text-left text-[11px] text-foreground/80 hover:border-border hover:bg-accent hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            {messages.map((m, i) => (
              <MessageBlock key={i} message={m} />
            ))}
            {streaming && (
              <>
                <ThinkingBlock
                  status={streaming.status}
                  thinking={streaming.thinking}
                  elapsed={streaming.elapsed}
                  error={streaming.error}
                />
                {(streaming.agentSteps.length > 0 ||
                  streaming.pendingToolCalls.length > 0 ||
                  streaming.finishSummary) && (
                  <AgentStepsBlock
                    steps={streaming.agentSteps}
                    pending={streaming.pendingToolCalls}
                    finishSummary={streaming.finishSummary}
                  />
                )}
                {streaming.filesWritten.length > 0 && (
                  <FilesWrittenBlock files={streaming.filesWritten} />
                )}
              </>
            )}
            {diagnosis && <DiagnosisDiffBlock diagnosis={diagnosis} />}
          </div>
        )}
      </div>

      <div className="border-t p-2">
        <ChatInput
          onSubmit={onSubmit}
          onCancel={cancel}
          streaming={!!streaming}
          placeholder={
            project ? 'Describe the simulation…' : 'Open a project to chat…'
          }
        />
      </div>
    </aside>
  )
}
