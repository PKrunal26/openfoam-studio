import { useEffect, useRef } from 'react'
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
        ts: typeof m.ts === 'string' ? m.ts : undefined,
        filesChanged: m.filesChanged,
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

  // Auto-scroll to the bottom on new messages / streaming updates.
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages.length, streaming?.filesWritten.length, streaming?.elapsed])

  const onSubmit = (prompt: string) => {
    if (!project) return
    sendPrompt(project.id, prompt, {
      onFilesWritten: () => {
        refreshFiles().catch(() => {})
      },
    })
  }

  const onClear = async () => {
    if (!project) return
    if (!confirm('Clear chat history for this project?')) return
    try {
      await clearHistory(project.id)
    } catch (err) {
      alert(`Failed: ${err instanceof Error ? err.message : String(err)}`)
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
          title="Clear conversation"
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Eraser className="h-3.5 w-3.5" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
        {empty ? (
          <div className="text-xs text-muted-foreground">
            <p>No conversation yet.</p>
            <p className="mt-1 text-[11px] leading-relaxed">
              Describe your simulation in plain English. The assistant will generate
              the OpenFOAM case files.
            </p>
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
