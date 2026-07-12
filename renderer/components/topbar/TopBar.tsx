import { ChevronLeft, Play, Square } from 'lucide-react'
import { cn } from '@/lib/cn'

interface TopBarProps {
  projectName?: string
  solver?: string
  onBack?: () => void
  onGenerate?: () => void
  generating?: boolean
  onRun?: () => void
  onCancelRun?: () => void
  running?: boolean
}

export function TopBar({
  projectName,
  solver,
  onBack,
  onGenerate,
  generating,
  onRun,
  onCancelRun,
  running,
}: TopBarProps) {
  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b bg-background px-3">
      <div className="flex items-center gap-2 min-w-0">
        {onBack ? (
          <button
            onClick={onBack}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Back"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : null}
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate text-sm font-medium">
            {projectName ?? 'OpenFOAM Studio'}
          </span>
          {solver ? (
            <span className="ml-2 rounded-md border bg-muted/50 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {solver}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={onGenerate}
          disabled={!onGenerate || generating}
          title={generating ? 'Generation in progress' : 'Open the assistant'}
          className={cn(
            'inline-flex h-7 items-center rounded-md border bg-background px-2.5 text-xs font-medium',
            'text-foreground hover:bg-accent disabled:opacity-50',
          )}
        >
          Generate
        </button>
        {running ? (
          <button
            onClick={onCancelRun}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 text-xs font-medium',
              'text-destructive hover:bg-destructive/20',
            )}
          >
            <Square className="h-3 w-3 fill-current" />
            Stop
          </button>
        ) : (
          <button
            onClick={onRun}
            disabled={!onRun}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium',
              'text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
            )}
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Run
          </button>
        )}
      </div>
    </header>
  )
}
