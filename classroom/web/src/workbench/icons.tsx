import {
  ArrowRightFromLine, ArrowRightToLine, Box, Check, CircleSlash, Clock, Droplet, Flag, Grid3x3, MoveRight,
  Sigma, Square, SquareDashed, Timer, Waves, Wind, X,
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

/** Order of setup nodes under the simulation, as a pre-processor lays them out. */
export const SECTION_ORDER: SectionNode[] = ['model', 'materials', 'initialConditions', 'boundaryConditions', 'numerics', 'simulationControl', 'mesh']

export function ItemIcon({ icon, size = 17 }: { icon?: string; size?: number }) {
  const props = { size, strokeWidth: 1.9, 'aria-hidden': true }
  switch (icon) {
    case 'inlet': return <ArrowRightToLine {...props} className="text-success" />
    case 'outlet': return <ArrowRightFromLine {...props} className="text-success" />
    case 'movingWall': return <MoveRight {...props} className="text-success" />
    case 'wall': return <Square {...props} className="text-success" />
    case 'open': return <Wind {...props} className="text-success" />
    case 'empty': return <SquareDashed {...props} className="text-[#8a96a3]" />
    case 'fluid': return <Droplet {...props} />
    case 'model': return <Waves {...props} />
    case 'initial': return <Flag {...props} />
    case 'numerics': return <Sigma {...props} />
    case 'control': return <Timer {...props} />
    case 'mesh': return <Grid3x3 {...props} />
    default: return <Box {...props} />
  }
}

/** Filled green tick used for completed setup nodes. */
export function Tick({ size = 17 }: { size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-success text-white" style={{ width: size, height: size }} aria-hidden>
      <Check size={size * 0.66} strokeWidth={3.6} />
    </span>
  )
}

export function RunStatusIcon({ status, size = 18 }: { status: RunStatus; size?: number }) {
  if (status === 'succeeded') return <Tick size={size} />
  if (status === 'running') return <Spinner size={size} className="text-accent-strong" />
  if (status === 'queued') return <Clock size={size} className="text-warning" aria-hidden />
  if (status === 'failed' || status === 'error') {
    return (
      <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-danger text-white" style={{ width: size, height: size }} aria-hidden>
        <X size={size * 0.66} strokeWidth={3.4} />
      </span>
    )
  }
  return <CircleSlash size={size} className="text-[#8a96a3]" aria-hidden />
}

export function statusText(status: RunStatus): string {
  return {
    succeeded: 'Finished', failed: 'Failed', queued: 'Queued', running: 'Running', cancelled: 'Cancelled',
    error: 'Could not run', interrupted: 'Interrupted', missing: 'Not computed',
  }[status]
}

export function StatusRing({ status }: { status: RunStatus }) {
  const tone = status === 'succeeded' ? 'border-success text-success'
    : status === 'failed' || status === 'error' ? 'border-danger text-danger'
    : status === 'running' ? 'border-accent-strong text-accent-strong'
    : status === 'queued' ? 'border-warning text-warning' : 'border-[#aab4be] text-[#8a96a3]'
  return (
    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[2.5px]', tone)}>
      <RunStatusIcon status={status} size={status === 'running' ? 18 : 19} />
    </span>
  )
}
