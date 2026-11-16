import { useEffect } from 'react'
import { usePath } from './router'
import { useSession } from './store'
import { Button, Spinner, Toasts, ViridisBand } from './ui/primitives'
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
    page = <div className="flex h-full items-center justify-center gap-3 text-ink-3"><Spinner size={18} /> Loading</div>
  } else if (!info) {
    page = (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="t-title text-[20px]">The classroom server is not reachable</p>
        <p className="text-ink-3">{error}</p>
        <Button onClick={() => void refresh()}>Try again</Button>
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
    <div className="flex h-full flex-col">
      <ViridisBand className="h-[3px] shrink-0" />
      <div className="min-h-0 flex-1">{page}</div>
      <Toasts />
    </div>
  )
}
