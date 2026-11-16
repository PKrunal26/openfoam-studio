import { useEffect, useState } from 'react'
import { ChevronDown, CircleCheck, Clock, Cpu, LogOut, Play, Shield } from 'lucide-react'
import { api, type TutorialSummary } from '@c/api'
import { navigate } from '@c/router'
import { useSession } from '@c/store'
import { Badge, Logo, Spinner, cn } from '@c/ui/primitives'

export function UserMenu() {
  const info = useSession((state) => state.info)
  const logout = useSession((state) => state.logout)
  const [open, setOpen] = useState(false)
  if (!info?.student) return null
  const initials = info.student.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="relative">
      <button type="button" className="flex h-10 items-center gap-2 rounded-md px-2 text-[15px] hover:bg-[#eef1f4]" onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open}>
        <span className="hidden max-w-[160px] truncate sm:block">{info.student.name}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#10212e] text-[12.5px] font-bold text-white">{initials}</span>
        <ChevronDown size={16} className="text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="panel-float absolute right-0 z-40 mt-1 w-56 py-1.5" role="menu">
            <div className="border-b px-3.5 pb-2 pt-1 text-[13px] text-muted-foreground">{info.className}</div>
            {info.instructorEnabled && (
              <button type="button" role="menuitem" className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-muted" onClick={() => navigate('/admin')}>
                <Shield size={16} /> Instructor view
              </button>
            )}
            <button type="button" role="menuitem" className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-muted" onClick={() => { void logout().then(() => navigate('/')) }}>
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export function ComputeChip() {
  const [status, setStatus] = useState<{ online: boolean; running: number; queued: number; slots: number } | null>(null)
  useEffect(() => {
    let alive = true
    const load = () => api.status().then((data) => { if (alive) setStatus(data.compute) }).catch(() => undefined)
    void load()
    const timer = setInterval(load, 5000)
    return () => { alive = false; clearInterval(timer) }
  }, [])
  if (!status) return null
  const busy = status.running + status.queued
  return (
    <div
      className={cn('hidden h-9 items-center gap-2 rounded-md border px-3 text-[13.5px] md:flex', status.online ? 'bg-white text-[#4b5661]' : 'border-[#f1c4c4] bg-danger-bg text-[#8f2020]')}
      title={status.online ? `${status.slots} solver slots shared by the class` : 'New runs are disabled until the compute backend is back'}
    >
      <Cpu size={15} />
      {status.online ? (busy ? `${status.running} running · ${status.queued} queued` : 'Compute idle') : 'Compute offline'}
    </div>
  )
}

function Thumbnail({ tutorial }: { tutorial: TutorialSummary }) {
  const [failed, setFailed] = useState(false)
  if (tutorial.hasThumbnail && !failed) {
    return <img src={api.thumbnailUrl(tutorial.id)} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#0f2533,#1b4a63)]">
      <svg viewBox="0 0 200 110" className="h-full w-full opacity-70" aria-hidden>
        {[20, 38, 56, 74, 92].map((y, i) => (
          <path key={y} d={`M0 ${y} C 50 ${y - 14 + i * 4}, 90 ${y + 16 - i * 5}, 200 ${y - 4}`} fill="none" stroke="#5cc8f2" strokeOpacity={0.25 + i * 0.1} strokeWidth="2" />
        ))}
      </svg>
    </div>
  )
}

function Card({ tutorial }: { tutorial: TutorialSummary }) {
  const ready = tutorial.reference.status === 'succeeded'
  const solving = tutorial.reference.status === 'running' || tutorial.reference.status === 'queued'
  return (
    <button
      type="button"
      onClick={() => navigate(`/t/${tutorial.id}`)}
      className="panel group flex flex-col overflow-hidden text-left transition-shadow hover:shadow-[0_6px_24px_rgb(16_24_40/0.14)]"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden border-b bg-[#eef1f4]">
        <Thumbnail tutorial={tutorial} />
        <div className="absolute left-3 top-3 flex gap-1.5">
          <span className="rounded bg-[#10212e]/85 px-2 py-0.5 text-[12px] font-bold text-white">Tutorial {tutorial.order}</span>
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-[#10212e]/0 transition-colors group-hover:bg-[#10212e]/25">
          <span className="flex h-12 w-12 scale-90 items-center justify-center rounded-full bg-white text-ink opacity-0 shadow-lg transition-all group-hover:scale-100 group-hover:opacity-100">
            <Play size={20} className="ml-0.5" />
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="accent">{tutorial.analysisType}</Badge>
          <Badge>{tutorial.dimension}</Badge>
          <Badge tone={tutorial.difficulty === 'Beginner' ? 'success' : tutorial.difficulty === 'Advanced' ? 'violet' : 'warning'}>{tutorial.difficulty}</Badge>
        </div>
        <h3 className="mt-2.5 text-[18px] leading-snug font-bold">{tutorial.title}</h3>
        <p className="mt-1 line-clamp-3 flex-1 text-[14px] text-muted-foreground">{tutorial.summary}</p>
        <div className="mt-3.5 flex items-center justify-between border-t pt-3 text-[13px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            {ready ? <><CircleCheck size={15} className="text-success" /> Solved</>
              : solving ? <><Spinner size={14} /> Solving reference…</>
              : <><Clock size={15} /> Reference not ready</>}
          </span>
          <span>
            {tutorial.mine?.runs ? `${tutorial.mine.runs} of your runs` : tutorial.mine ? 'Opened' : `Re-run ${tutorial.estimatedRuntime}`}
          </span>
        </div>
      </div>
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

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-white px-4">
        <Logo />
        <div className="text-[18px] font-black tracking-tight">OpenFOAM Studio <span className="font-normal text-muted-foreground">Classroom</span></div>
        <div className="flex-1" />
        <ComputeChip />
        <UserMenu />
      </header>
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[1280px] px-6 py-8">
          <p className="text-[13.5px] font-bold tracking-wide text-accent-foreground uppercase">{info.className}</p>
          <h1 className="mt-1 text-[30px] font-black tracking-tight">Tutorials</h1>
          <p className="mt-1.5 max-w-[720px] text-[15.5px] text-muted-foreground">
            Each tutorial opens with a solved reference case. Explore its setup and results, then change a setting and run it again to see what happens.
          </p>
          {error && <p className="mt-6 text-danger">{error}</p>}
          {!tutorials && !error && <div className="mt-10 flex items-center gap-3 text-muted-foreground"><Spinner size={18} /> Loading tutorials…</div>}
          {tutorials && (
            <div className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {tutorials.map((tutorial) => <Card key={tutorial.id} tutorial={tutorial} />)}
            </div>
          )}
          {tutorials?.length === 0 && <p className="mt-8 text-muted-foreground">No tutorials are installed on this server.</p>}
        </div>
      </main>
    </div>
  )
}
