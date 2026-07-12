import { useEffect, useState } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'project'; id: string }

function parseHash(hash: string): Route {
  const clean = hash.replace(/^#/, '')
  const parts = clean.split('/').filter(Boolean)
  if (parts[0] === 'project' && parts[1]) return { name: 'project', id: parts[1] }
  return { name: 'home' }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return route
}

export function navigate(route: Route) {
  if (route.name === 'home') window.location.hash = '#/'
  else window.location.hash = `#/project/${route.id}`
}
