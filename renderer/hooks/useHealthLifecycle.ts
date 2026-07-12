import { useCallback, useEffect, useState } from 'react'
import {
  startHealthLifecycle,
  stopHealthLifecycle,
  subscribeHealth,
  runHealthCheck,
  type HealthReason,
} from '@/lib/healthLifecycle'
import type { HealthResult } from '@/lib/api'

export interface UseHealthLifecycleResult {
  health: HealthResult | null
  checkNow: (reason?: HealthReason) => Promise<HealthResult>
}

export function useHealthLifecycle(
  opts: { intervalMs?: number } = {},
): UseHealthLifecycleResult {
  const [health, setHealth] = useState<HealthResult | null>(null)

  useEffect(() => {
    const unsubscribe = subscribeHealth(setHealth)
    startHealthLifecycle(opts)
    return () => {
      unsubscribe()
      stopHealthLifecycle()
    }
    // opts intentionally not in deps — stabilise on mount values only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const checkNow = useCallback(
    (reason: HealthReason = 'manual') => runHealthCheck(reason),
    [],
  )

  return { health, checkNow }
}
