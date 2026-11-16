import { useEffect } from 'react'
import { usePath } from './router'
import { useSession } from './store'
import { Spinner, Toasts } from './ui/primitives'
import { JoinPage } from './pages/JoinPage'
import { Dashboard } from './pages/Dashboard'
import { Workbench } from './pages/Workbench'
import { AdminPage } from './pages/AdminPage'

export function App() {
  const path = usePath()
  const { info, loading, error, refresh } = useSession()

  useEffect(() => { void refresh() }, [refresh])

  let page
  if (loading) {
    page = (
      <div className="flex h-full items-center justify-center gap-3 text-muted-foreground">
        <Spinner size={20} /> Loading…
      </div>
    )
  } else if (!info) {
    page = (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-[17px] font-bold">The classroom server is not reachable</p>
        <p className="text-muted-foreground">{error}</p>
        <button type="button" className="font-bold text-accent-foreground underline" onClick={() => void refresh()}>Try again</button>
      </div>
    )
  } else if (path.startsWith('/admin')) {
    page = <AdminPage />
  } else if (!info.student) {
    page = <JoinPage />
  } else {
    const match = /^\/t\/([a-z][a-z0-9-]*)\/?$/.exec(path)
    page = match ? <Workbench key={match[1]} tutorialId={match[1]!} /> : <Dashboard />
  }

  return (
    <>
      {page}
      <Toasts />
    </>
  )
}
