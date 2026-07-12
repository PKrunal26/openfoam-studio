import { Loader2 } from 'lucide-react'

interface Props {
  status: string
  thinking: string
  elapsed: number
  error?: string | null
}

export function ThinkingBlock({ status, thinking, elapsed, error }: Props) {
  return (
    <div className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {error ? (
          <span className="h-2 w-2 rounded-full bg-destructive" />
        ) : (
          <Loader2 className="h-3 w-3 animate-spin text-foreground/70" />
        )}
        <span className="font-medium text-foreground/85">{status}</span>
        {elapsed > 0 && !error && (
          <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
            {elapsed}s
          </span>
        )}
      </div>
      {thinking && !error && (
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{thinking}</p>
      )}
      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  )
}
