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

export function runHealthCheck(_reason: HealthReason): Promise<HealthResult> {
  if (state.inFlight !== null) return state.inFlight

  const promise = getHealth()
    .then((result) => {
      state.latest = result
      state.inFlight = null
      state.listeners.forEach((l) => l(result))
      scheduleNextTick()
      return result
    })
    .catch((err) => {
      state.inFlight = null
      scheduleNextTick()
      throw err
    })

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
