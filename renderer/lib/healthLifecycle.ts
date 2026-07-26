import { getHealth, type HealthResult } from './api'

export type HealthReason = 'startup' | 'periodic' | 'manual'

export type HealthListener = (result: HealthResult) => void

interface LifecycleState {
  active: boolean
  intervalMs: number
  inFlight: Promise<HealthResult> | null
  timer: ReturnType<typeof setTimeout> | null
  latest: HealthResult | null
  listeners: Set<HealthListener>
}

const state: LifecycleState = {
  active: false,
  intervalMs: 60_000,
  inFlight: null,
  timer: null,
  latest: null,
  listeners: new Set(),
}

function scheduleNextTick() {
  if (state.timer !== null) clearTimeout(state.timer)
  // An in-flight check resolves by calling this; if the lifecycle was stopped
  // meanwhile, don't re-arm the timer (would leak a poll after unmount).
  if (!state.active) {
    state.timer = null
    return
  }
  state.timer = setTimeout(() => {
    state.timer = null
    runHealthCheck('periodic')
  }, state.intervalMs)
}

/**
 * A probe that never answered is a failed probe, not a non-event.
 *
 * Rethrowing here left `health` null forever, and App.tsx only shows the setup
 * modal for a result with ok:false — so a wedged Docker daemon or a dead
 * backend dropped the user into the workspace with no warning at all. Report it
 * as an unhealthy result the setup modal can render instead.
 */
function unreachableResult(err: unknown): HealthResult {
  const detail = err instanceof Error ? err.message : String(err)
  return {
    ok: false,
    checks: [
      {
        name: 'docker',
        label: 'Docker daemon',
        pass: false,
        fix: `Health check could not complete (${detail}). Start Docker Desktop, or on Linux: sudo systemctl start docker`,
        canAutoFix: true,
      },
    ],
  }
}

export function runHealthCheck(_reason: HealthReason): Promise<HealthResult> {
  if (state.inFlight !== null) return state.inFlight

  const settle = (result: HealthResult) => {
    state.latest = result
    state.inFlight = null
    state.listeners.forEach((l) => l(result))
    scheduleNextTick()
    return result
  }

  const promise = getHealth()
    .then(settle)
    .catch((err) => settle(unreachableResult(err)))

  state.inFlight = promise
  return promise
}

export function startHealthLifecycle(opts: { intervalMs?: number } = {}) {
  if (opts.intervalMs !== undefined) state.intervalMs = opts.intervalMs
  state.active = true
  runHealthCheck('startup')
}

export function stopHealthLifecycle() {
  state.active = false
  if (state.timer !== null) {
    clearTimeout(state.timer)
    state.timer = null
  }
}

export function subscribeHealth(listener: HealthListener): () => void {
  state.listeners.add(listener)
  if (state.latest !== null) listener(state.latest)
  return () => { state.listeners.delete(listener) }
}

export function getLatestHealth(): HealthResult | null {
  return state.latest
}

/** Test seam — clears cached state between cases. */
export function _resetHealthLifecycle(): void {
  stopHealthLifecycle()
  state.inFlight = null
  state.latest = null
  state.listeners.clear()
  state.intervalMs = 60_000
}
