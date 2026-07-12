import { useState } from 'react'
import { ChevronDown, ChevronRight, Check, X, Loader2 } from 'lucide-react'
import type { AgentStep, AgentToolCall } from '@/store/useChatStore'
import { Markdown } from '../Markdown'

interface Props {
  steps: AgentStep[]
  pending: AgentToolCall[]
  finishSummary?: string
}

const TOOL_LABELS: Record<string, string> = {
  list_case_files: 'List case files',
  read_case_file: 'Read',
  write_case_file: 'Write',
  edit_case_file: 'Edit',
  search_docs: 'Search docs',
  read_doc: 'Read doc',
  run_command: 'Run',
  finish: 'Finish',
}

function summarizeArgs(tool: string, args: unknown): string {
  if (!args || typeof args !== 'object') return ''
  const a = args as Record<string, unknown>
  if (tool === 'write_case_file' || tool === 'edit_case_file' || tool === 'read_case_file') {
    return typeof a.path === 'string' ? a.path : ''
  }
  if (tool === 'search_docs') {
    return typeof a.query === 'string' ? `“${a.query}”` : ''
  }
  if (tool === 'read_doc') {
    return typeof a.path === 'string' ? a.path : ''
  }
  if (tool === 'run_command') {
    const cmd = typeof a.cmd === 'string' ? a.cmd : ''
    const steps = typeof a.steps === 'number' ? ` (${a.steps} steps)` : ''
    return cmd + steps
  }
  if (tool === 'finish') return ''
  return ''
}

function ToolCallRow({ call }: { call: AgentToolCall }) {
  const [open, setOpen] = useState(false)
  const hasDetail = (call.preview && call.preview.length > 0) || (call.lines && call.lines.length > 0)
  const label = TOOL_LABELS[call.tool] ?? call.tool
  const args = summarizeArgs(call.tool, call.args)

  return (
    <div className="rounded border border-border/40 bg-background/40 px-2 py-1 text-[11px]">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 text-left text-foreground/85"
        onClick={() => hasDetail && setOpen((v) => !v)}
        disabled={!hasDetail}
      >
        {call.status === 'running' ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : call.status === 'ok' ? (
          <Check className="h-3 w-3 text-emerald-500" />
        ) : (
          <X className="h-3 w-3 text-destructive" />
        )}
        <span className="font-medium">{label}</span>
        {args && <span className="truncate text-muted-foreground">{args}</span>}
        {call.durationMs !== undefined && call.durationMs > 100 && (
          <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
            {(call.durationMs / 1000).toFixed(1)}s
          </span>
        )}
        {hasDetail && (
          open
            ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
            : <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
      </button>
      {open && hasDetail && (
        <div className="mt-1 ml-4 space-y-1">
          {call.preview && (
            <p className="whitespace-pre-wrap break-words text-[10px] leading-relaxed text-muted-foreground">
              {call.preview}
            </p>
          )}
          {call.lines && call.lines.length > 0 && (
            <pre className="max-h-40 overflow-y-auto rounded bg-muted/40 p-1 text-[10px] leading-tight">
              {call.lines.join('\n')}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

export function AgentStepsBlock({ steps, pending, finishSummary }: Props) {
  const allCalls: AgentToolCall[] = [...steps.flatMap((s) => s.toolCalls), ...pending]
  if (allCalls.length === 0 && !finishSummary) return null

  return (
    <div className="rounded-md border border-dashed bg-muted/10 px-2 py-2 text-xs">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Agent activity
        <span className="text-muted-foreground/70">· {allCalls.length} step{allCalls.length === 1 ? '' : 's'}</span>
      </div>
      <div className="grid gap-1">
        {allCalls.map((c) => (
          <ToolCallRow key={c.id} call={c} />
        ))}
      </div>
      {finishSummary && (
        <div className="mt-2 text-[11px] leading-relaxed text-foreground/85">
          <Markdown text={finishSummary} />
        </div>
      )}
    </div>
  )
}
