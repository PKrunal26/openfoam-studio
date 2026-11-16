import { useEffect, useState } from 'react'
import { ArrowUpRight, ChevronDown, LogOut, Shield } from 'lucide-react'
import { api, type TutorialSummary } from '@c/api'
import { navigate } from '@c/router'
import { useSession } from '@c/store'
import { Blocks, Spinner, Wordmark, cn, pad2 } from '@c/ui/primitives'

export function UserMenu() {
  const info = useSession((state) => state.info)
  const logout = useSession((state) => state.logout)
  const [open, setOpen] = useState(false)
  if (!info?.student) return null
  const initials = info.student.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="relative">
      <button type="button" className="flex h-9 items-center gap-2 pl-2 pr-1 text-[13.5px] hover:bg-wash" onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open}>
        <span className="hidden max-w-[150px] truncate md:block">{info.student.name}</span>
        <span className="flex h-7 w-7 items-center justify-center bg-ink font-mono text-[11px] font-medium text-white">{initials}</span>
        <ChevronDown size={14} className="text-ink-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="pop cls-pop-in absolute right-0 z-40 mt-1 w-56 py-1" role="menu">
            <div className="t-eyebrow px-3 pb-2 pt-2">{info.className}</div>
            {info.instructorEnabled && (
              <button type="button" role="menuitem" className="flex h-9 w-full items-center gap-2.5 px-3 text-left text-[13.5px] hover:bg-wash" onClick={() => navigate('/admin')}>
                <Shield size={15} /> Instructor view
              </button>
            )}
            <button type="button" role="menuitem" className="flex h-9 w-full items-center gap-2.5 px-3 text-left text-[13.5px] hover:bg-wash" onClick={() => { void logout().then(() => navigate('/')) }}>
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** Shared solver capacity, as a row of slot blocks. */
export function ComputeStatus() {
  const [status, setStatus] = useState<{ online: boolean; running: number; queued: number; slots: number } | null>(null)
  useEffect(() => {
    let alive = true
    const load = () => api.status().then((data) => { if (alive) setStatus(data.compute) }).catch(() => undefined)
    void load()
    const timer = setInterval(load, 5000)
    return () => { alive = false; clearInterval(timer) }
  }, [])
  if (!status) return null
  const text = !status.online ? 'Compute offline' : status.running + status.queued === 0 ? 'Compute idle' : `${status.running} running${status.queued ? `, ${status.queued} queued` : ''}`
  return (
    <span className="flex items-center gap-2 font-mono text-[11.5px] text-ink-3" title={status.online ? `${status.slots} solver slots shared by the class` : 'New runs are disabled until the compute backend is back'}>
      <span className="flex gap-[2px]">
        {status.online
          ? Array.from({ length: Math.max(1, status.slots) }, (_, i) => <span key={i} className={cn('h-2.5 w-2.5', i < status.running ? 'bg-v2' : 'bg-wash-2')} />)
          : <span className="h-2.5 w-2.5 bg-bad" />}
      </span>
      <span className={cn(!status.online && 'text-bad')}>{text}</span>
    </span>
  )
}

const LEVEL: Record<string, number> = { Beginner: 1, Intermediate: 2, Advanced: 3 }

function Card({ tutorial }: { tutorial: TutorialSummary }) {
  const [failed, setFailed] = useState(false)
  const ready = tutorial.reference.status === 'succeeded'
  const solving = tutorial.reference.status === 'running' || tutorial.reference.status === 'queued'
  return (
    <button type="button" onClick={() => navigate(`/t/${tutorial.id}`)} className="group flex flex-col text-left">
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-wash">
        {tutorial.hasThumbnail && !failed
          ? <img src={api.thumbnailUrl(tutorial.id)} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" onError={() => setFailed(true)} />
          : <div className="flex h-full items-center justify-center font-mono text-[12px] text-ink-4">no preview</div>}
        <span className="absolute left-0 top-0 bg-paper px-2.5 py-1.5 font-mono text-[12px] font-medium">{pad2(tutorial.order)}</span>
        <span className="absolute bottom-0 right-0 flex h-9 w-9 translate-y-full items-center justify-center bg-ink text-white transition-transform group-hover:translate-y-0"><ArrowUpRight size={17} /></span>
        <span className="absolute inset-x-0 bottom-0 h-[3px] origin-left scale-x-0 bg-primary transition-transform duration-300 group-hover:scale-x-100" />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <span className="t-eyebrow">{tutorial.analysisType} · {tutorial.dimension}</span>
        <span className="h-px flex-1 bg-line" />
        <Blocks value={LEVEL[tutorial.difficulty] ?? 1} label={`${tutorial.difficulty} level`} />
      </div>
      <h3 className="t-title mt-2 text-[21px] decoration-primary decoration-2 underline-offset-4 group-hover:underline">{tutorial.title}</h3>
      <p className="mt-1.5 line-clamp-3 text-[13.5px] leading-relaxed text-ink-2">{tutorial.summary}</p>
      <p className="mt-3 flex items-center gap-2 font-mono text-[11.5px] text-ink-3">
        {ready ? <><span className="h-2 w-2 bg-ok" /> solved</> : solving ? <><Spinner size={12} /> solving reference</> : <><span className="h-2 w-2 bg-ink-4" /> reference not ready</>}
        <span className="text-ink-4">/</span>
        {tutorial.mine?.runs ? `${tutorial.mine.runs} of your runs` : tutorial.mine ? 'opened' : `re-run ${tutorial.estimatedRuntime}`}
      </p>
    </button>
  )
}

export function Dashboard() {
  const info = useSession((state) => state.info)!
  const [tutorials, setTutorials] = useState<TutorialSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = () => api.tutorials().then((data) => {
      if (!alive) return
      setTutorials(data.tutorials)
      setError(null)
      // Keep refreshing while reference solutions are still being computed.
      if (data.tutorials.some((tutorial) => tutorial.reference.status === 'running' || tutorial.reference.status === 'queued')) timer = setTimeout(load, 3000)
    }).catch((e: Error) => { if (alive) setError(e.message) })
    void load()
    return () => { alive = false; if (timer) clearTimeout(timer) }
  }, [])

  useEffect(() => { document.title = 'OpenFOAM Studio Classroom' }, [])

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[52px] shrink-0 items-center gap-5 border-b px-5">
        <Wordmark />
        <div className="flex-1" />
        <ComputeStatus />
        <UserMenu />
      </header>
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[1240px] px-6 pb-16 pt-12 sm:px-10">
          <p className="t-eyebrow">{info.className}</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
            <h1 className="t-display text-[52px]">Tutorials</h1>
            <p className="max-w-[520px] pb-1.5 text-[15px] leading-relaxed text-ink-2">
              Every case opens already solved. Read its setup, look at the results, then change one thing and run it again.
            </p>
          </div>
          {error && <p className="mt-8 text-bad">{error}</p>}
          {!tutorials && !error && <div className="mt-12 flex items-center gap-3 text-ink-3"><Spinner size={16} /> Loading tutorials</div>}
          {tutorials && (
            <div className="mt-10 grid gap-x-8 gap-y-12 border-t pt-10 sm:grid-cols-2 lg:grid-cols-3">
              {tutorials.map((tutorial) => <Card key={tutorial.id} tutorial={tutorial} />)}
            </div>
          )}
          {tutorials?.length === 0 && <p className="mt-10 text-ink-3">No tutorials are installed on this server.</p>}
        </div>
      </main>
    </div>
  )
}
