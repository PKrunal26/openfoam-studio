import { useEditorStore } from '@/store/useEditorStore'
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
    let acceptedHash = window.location.hash
    const onHash = () => {
      const target = window.location.hash
      history.replaceState(null, '', acceptedHash || '#/')
      useEditorStore.getState().guard(() => {
        acceptedHash = target
        history.replaceState(null, '', target || '#/')
        setRoute(parseHash(target))
      })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return route
}

export function navigate(route: Route) {
  if (route.name === 'home') window.location.hash = '#/'
  else window.location.hash = `#/project/${route.id}`
}
