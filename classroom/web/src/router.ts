import { useSyncExternalStore } from 'react'

// Minimal history router: the server answers every non-API path with index.html.
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())
window.addEventListener('popstate', notify)

export function navigate(path: string, replace = false): void {
  if (path === window.location.pathname) return
  if (replace) window.history.replaceState(null, '', path)
  else window.history.pushState(null, '', path)
  notify()
}

export function usePath(): string {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    () => window.location.pathname,
  )
}
