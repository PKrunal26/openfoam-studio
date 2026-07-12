import { useEditorStore } from '@/store/useEditorStore'
import { useProjectStore } from '@/store/useProjectStore'
import type { ChatMessage } from '@/store/useChatStore'
import { cn } from '@/lib/cn'

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
      <div className="whitespace-pre-wrap break-words font-[450]">{message.content}</div>

      {message.filesChanged && message.filesChanged.length > 0 && project && (
        <ul className="mt-2 grid gap-0.5">
          {message.filesChanged.map((f) => (
            <li key={f}>
              <button
                onClick={() => openCaseFile(project.id, f)}
                className="font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline"
              >
                {f}
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
