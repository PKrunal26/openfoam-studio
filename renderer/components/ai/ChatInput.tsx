import { useState, useRef, useEffect } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { cn } from '@/lib/cn'

interface Props {
  onSubmit: (prompt: string) => void
  onCancel?: () => void
  streaming?: boolean
  placeholder?: string
}

export function ChatInput({ onSubmit, onCancel, streaming, placeholder }: Props) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  // Auto-grow up to ~6 lines.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [value])

  const submit = () => {
    if (streaming) return
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmit(trimmed)
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
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder={placeholder ?? 'Describe the simulation…'}
        className="block w-full resize-none bg-transparent px-2.5 py-2 text-xs leading-relaxed outline-none placeholder:text-muted-foreground scrollbar-hidden"
      />
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
            disabled={!value.trim()}
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
