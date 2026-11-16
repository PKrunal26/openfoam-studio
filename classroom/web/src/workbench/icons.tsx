import {
  ArrowRightFromLine, ArrowRightToLine, Atom, Box, Check, Droplet, Flag, Grid3x3, Minus, MoveRight,
  Sigma, Square, SquareDashed, Timer, Wind, X,
} from 'lucide-react'
import type { RunStatus, SectionNode } from '@c/api'
import { Spinner, cn } from '@c/ui/primitives'

export const SECTION_LABELS: Record<SectionNode, string> = {
  model: 'Model',
  materials: 'Materials',
  initialConditions: 'Initial conditions',
  boundaryConditions: 'Boundary conditions',
  numerics: 'Numerics',
  simulationControl: 'Simulation control',
  mesh: 'Mesh',
}

/** Order of setup steps, following how a case is put together. */
export const SECTION_ORDER: SectionNode[] = ['model', 'materials', 'initialConditions', 'boundaryConditions', 'numerics', 'simulationControl', 'mesh']

export function ItemIcon({ icon, size = 15 }: { icon?: string; size?: number }) {
  const props = { size, strokeWidth: 1.75, 'aria-hidden': true }
  switch (icon) {
    case 'inlet': return <ArrowRightToLine {...props} />
    case 'outlet': return <ArrowRightFromLine {...props} />
    case 'movingWall': return <MoveRight {...props} />
    case 'wall': return <Square {...props} />
    case 'open': return <Wind {...props} />
    case 'empty': return <SquareDashed {...props} />
    case 'fluid': return <Droplet {...props} />
    case 'model': return <Atom {...props} />
    case 'initial': return <Flag {...props} />
    case 'numerics': return <Sigma {...props} />
    case 'control': return <Timer {...props} />
    case 'mesh': return <Grid3x3 {...props} />
    default: return <Box {...props} />
  }
}

/** Square status marker: the run state at a glance. */
export function StatusBlock({ status, size = 16 }: { status: RunStatus; size?: number }) {
  const box = { width: size, height: size }
  if (status === 'running') return <span className="flex shrink-0 items-center justify-center text-primary" style={box}><Spinner size={size - 2} /></span>
  const tone = status === 'succeeded' ? 'bg-ok text-white' : status === 'failed' || status === 'error' ? 'bg-bad text-white' : status === 'queued' ? 'bg-v4 text-ink' : 'bg-wash-2 text-ink-3'
  const Icon = status === 'succeeded' ? Check : status === 'failed' || status === 'error' ? X : Minus
  return <span className={cn('flex shrink-0 items-center justify-center', tone)} style={box} aria-hidden><Icon size={size * 0.7} strokeWidth={3} /></span>
}

export function statusText(status: RunStatus): string {
  return {
    succeeded: 'Finished', failed: 'Failed', queued: 'Queued', running: 'Running', cancelled: 'Cancelled',
    error: 'Could not run', interrupted: 'Interrupted', missing: 'Not computed',
  }[status]
}
