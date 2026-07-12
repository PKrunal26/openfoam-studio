import { Component, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

/**
 * Fallback shown when a vtk.js viewer can't render — either a thrown render
 * error caught by the boundary, or a proactively-detected lost WebGL context.
 * Kept as a plain presentational component so the proactive path (context-loss
 * detection in the hooks) can render the exact same UI without throwing.
 */
export function ViewerUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
      <div className="max-w-xs space-y-3">
        <AlertTriangle className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="text-xs text-foreground">3D rendering unavailable — WebGL context lost.</p>
        <p className="text-[11px] text-muted-foreground">
          Try reloading. If it keeps happening, restart the app to recover the GPU process.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mx-auto flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs hover:bg-accent hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" />
          Retry
        </button>
      </div>
    </div>
  )
}

interface Props {
  children: ReactNode
  /** Invoked when the user clicks Retry, after the boundary resets its state. */
  onRetry?: () => void
}

interface State {
  hasError: boolean
}

/**
 * Catches render/runtime errors from a vtk.js viewer subtree (notably the
 * `new Proxy(null)` TypeError from GenericRenderWindow when the WebGL context
 * is gone) so a viewer crash degrades to a fallback instead of unmounting the
 * whole app to a black screen.
 */
export class ViewerErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error('3D viewer error boundary caught:', error)
  }

  private reset = () => {
    this.setState({ hasError: false })
    this.props.onRetry?.()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="relative h-full w-full">
          <ViewerUnavailable onRetry={this.reset} />
        </div>
      )
    }
    return this.props.children
  }
}
