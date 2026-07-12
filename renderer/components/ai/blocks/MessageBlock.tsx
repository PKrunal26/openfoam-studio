import { useState } from 'react'
import { Check, ChevronDown, ChevronRight, FileText, X } from 'lucide-react'
import { useEditorStore } from '@/store/useEditorStore'
import { useProjectStore } from '@/store/useProjectStore'
import type { ChatMessage, PersistedAgentStep } from '@/store/useChatStore'
import { cn } from '@/lib/cn'
import { Markdown } from '../Markdown'

const TOOL_LABELS: Record<string, string> = {
  list_case_files: 'List files',
  read_case_file: 'Read',
  write_case_file: 'Write',
  edit_case_file: 'Edit',
  search_docs: 'Search docs',
  read_doc: 'Read doc',
  run_command: 'Run',
  finish: 'Finish',
}

/** Collapsed-by-default trail of what the agent did during this turn. */
function ActivityTrail({ steps }: { steps: PersistedAgentStep[] }) {
  const [open, setOpen] = useState(false)
  const failed = steps.filter((s) => !s.ok).length
  return (
    <div className="mb-1.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Agent activity · {steps.length} step{steps.length === 1 ? '' : 's'}
        {failed > 0 && <span className="text-destructive">· {failed} failed</span>}
      </button>
      {open && (
        <ul className="mt-1 grid gap-0.5 border-l border-border/50 pl-2">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {s.ok ? (
                <Check className="h-2.5 w-2.5 shrink-0 text-emerald-500" />
              ) : (
                <X className="h-2.5 w-2.5 shrink-0 text-destructive" />
              )}
              <span className="text-foreground/75">{TOOL_LABELS[s.tool] ?? s.tool}</span>
              {s.summary && <span className="truncate font-mono text-[10px]">{s.summary}</span>}
              {s.durationMs !== undefined && s.durationMs > 1000 && (
                <span className="ml-auto shrink-0 text-[10px] tabular-nums">
                  {(s.durationMs / 1000).toFixed(1)}s
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function MessageBlock({ message }: { message: ChatMessage }) {
  const project = useProjectStore((s) => s.project)
  const openCaseFile = useEditorStore((s) => s.openCaseFile)
  const isUser = message.role === 'user'

  return (
    <article
      className={cn(
        'rounded-md border px-3 py-2 text-xs leading-relaxed',
        isUser
          ? 'border-border bg-muted/30 text-foreground/90'
          : 'border-transparent bg-transparent text-foreground/85',
      )}
    >
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {isUser ? 'You' : 'Assistant'}
      </div>
      {!isUser && message.agentSteps && message.agentSteps.length > 0 && (
        <ActivityTrail steps={message.agentSteps} />
      )}
      {isUser ? (
        <div className="whitespace-pre-wrap break-words font-[450]">{message.content}</div>
      ) : (
        <div className="break-words font-[450]">
          <Markdown text={message.content} />
        </div>
      )}

      {message.filesChanged && message.filesChanged.length > 0 && project && (
        <div className="mt-2 flex flex-wrap gap-1">
          {message.filesChanged.map((f) => (
            <button
              key={f}
              onClick={() => openCaseFile(project.id, f)}
              title={`Open ${f}`}
              className="inline-flex items-center gap-1 rounded border border-border/60 bg-muted/20 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:border-border hover:text-foreground"
            >
              <FileText className="h-2.5 w-2.5" />
              {f}
            </button>
          ))}
        </div>
      )}
    </article>
  )
}
