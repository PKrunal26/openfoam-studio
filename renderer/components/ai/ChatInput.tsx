import { useState, useRef, useEffect } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { cn } from '@/lib/cn'

interface Props {
  onSubmit: (prompt: string, intent: 'question' | 'edit') => void
  onCancel?: () => void
  streaming?: boolean
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({ onSubmit, onCancel, streaming, placeholder, disabled }: Props) {
  const [value, setValue] = useState('')
  const [intent, setIntent] = useState<'question' | 'edit'>('edit')
  const ref = useRef<HTMLTextAreaElement>(null)

  // Auto-grow up to ~6 lines.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [value])

  const submit = () => {
    if (streaming || disabled) return
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmit(trimmed, intent)
    setValue('')
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="rounded-md border bg-background focus-within:ring-1 focus-within:ring-ring">
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        <label htmlFor="assistant-intent" className="text-[11px] text-muted-foreground">Mode</label>
        <select id="assistant-intent" disabled={disabled || streaming} value={intent} onChange={(e) => setIntent(e.target.value as 'question' | 'edit')} className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-xs">
          <option value="edit">Change case</option><option value="question">Ask a question</option>
        </select>
      </div>
      <textarea
        ref={ref}
        aria-label="Message to simulation assistant"
        disabled={disabled}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder={intent === 'question' ? 'Ask about the saved case…' : placeholder ?? 'Describe the simulation…'}
        className="block w-full resize-none bg-transparent px-2.5 py-2 text-xs leading-relaxed outline-none placeholder:text-muted-foreground scrollbar-hidden"
      />
      <p className="px-2.5 pb-2 text-[11px] leading-relaxed text-muted-foreground">{intent === 'question' ? 'Questions read saved files and preserve case inputs.' : 'Changes create a recoverable revision. Review the updated inputs before running.'}</p>
      <div className="flex items-center justify-between border-t px-2 py-1.5">
        <span className="text-[10px] text-muted-foreground">Enter to send · Shift+Enter for newline</span>
        {streaming ? (
          <button
            onClick={onCancel}
            className="inline-flex h-6 items-center gap-1 rounded-md border bg-background px-2 text-[11px] hover:bg-accent"
          >
            <Square className="h-3 w-3 fill-current" />
            Stop
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={disabled || !value.trim()}
            className={cn(
              'inline-flex h-6 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90',
              'disabled:opacity-40',
            )}
          >
            <ArrowUp className="h-3 w-3" />
            Send
          </button>
        )}
      </div>
    </div>
  )
}
