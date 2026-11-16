import { useSyncExternalStore } from 'react'

// Minimal history router: the server answers every non-API path with index.html.
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())
window.addEventListener('popstate', notify)

// The static preview is hosted at a fixed URL, so its route lives in memory.
const IN_MEMORY = import.meta.env.VITE_STATIC_DEMO === '1'
let memoryPath = '/'

export function navigate(path: string, replace = false): void {
  if (IN_MEMORY) { memoryPath = path; notify(); return }
  if (path === window.location.pathname) return
  if (replace) window.history.replaceState(null, '', path)
  else window.history.pushState(null, '', path)
  notify()
}

export function usePath(): string {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    () => (IN_MEMORY ? memoryPath : window.location.pathname),
  )
}
