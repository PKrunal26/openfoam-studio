import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, KeyRound, RefreshCw, Trash2 } from 'lucide-react'
import { api, type AdminOverview } from '@c/api'
import { navigate } from '@c/router'
import { useSession, useToasts } from '@c/store'
import { Badge, Button, Logo, Notice, Spinner, formatDuration, timeAgo } from '@c/ui/primitives'

function Login({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try { await api.adminLogin(code); onDone() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="flex h-full items-center justify-center p-6">
      <form onSubmit={submit} className="panel w-full max-w-[400px] p-7">
        <div className="flex items-center gap-3"><Logo /><span className="text-[18px] font-black">Instructor sign-in</span></div>
        <label className="mt-6 block">
          <span className="mb-1.5 block text-[14px] font-bold">Instructor code</span>
          <input type="password" autoFocus required value={code} onChange={(e) => setCode(e.target.value)} className="h-11 w-full rounded-md border border-input px-3 text-[15.5px] outline-none focus:border-accent-strong" />
        </label>
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
        <Button type="submit" variant="primary" size="lg" className="mt-5 w-full" disabled={busy}>{busy && <Spinner />} Sign in</Button>
        <button type="button" className="mt-4 block w-full text-center text-[13.5px] text-muted-foreground hover:underline" onClick={() => navigate('/')}>Back to the classroom</button>
      </form>
    </div>
  )
}

export function AdminPage() {
  const info = useSession((state) => state.info)!
  const refreshSession = useSession((state) => state.refresh)
  const push = useToasts((state) => state.push)
  const [data, setData] = useState<AdminOverview | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => api.adminOverview().then((overview) => { setData(overview); setError(null) }).catch((e: Error) => setError(e.message)), [])
  useEffect(() => {
    if (!info.instructor) return
    void load()
    const timer = setInterval(() => void load(), 5000)
    return () => clearInterval(timer)
  }, [info.instructor, load])

  if (!info.instructorEnabled) {
    return <div className="flex h-full flex-col items-center justify-center gap-3"><p className="text-[17px] font-bold">Instructor access is not enabled on this server</p><p className="text-muted-foreground">Set OFS_INSTRUCTOR_CODE and restart the server.</p><Button onClick={() => navigate('/')}>Back</Button></div>
  }
  if (!info.instructor) return <Login onDone={() => void refreshSession()} />

  const act = async (work: () => Promise<unknown>, done: string) => {
    try { await work(); push('success', done); void load() } catch (e) { push('error', (e as Error).message) }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-white px-4">
        <Logo />
        <div className="text-[18px] font-black tracking-tight">Instructor overview</div>
        <Badge tone="violet">{info.className}</Badge>
        <div className="flex-1" />
        <Button onClick={() => navigate('/')}><ArrowLeft size={16} /> Classroom</Button>
      </header>
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[1280px] space-y-6 px-6 py-6">
          {error && <Notice tone="error">{error}</Notice>}
          {!data && !error && <div className="flex items-center gap-3 text-muted-foreground"><Spinner /> Loading…</div>}
          {data && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Students', String(data.students.length)],
                  ['Compute', data.queue.online ? `${data.queue.running}/${data.queue.slots} slots busy` : 'Offline'],
                  ['Queued runs', String(data.queue.queued)],
                  ['Stored results', `${data.cache.entries} · ${(data.cache.bytes / 1e9).toFixed(2)} of ${(data.cache.maxBytes / 1e9).toFixed(0)} GB`],
                ].map(([label, value]) => (
                  <div key={label} className="panel p-4">
                    <div className="text-[12.5px] font-bold tracking-wide text-muted-foreground uppercase">{label}</div>
                    <div className="mt-1 text-[22px] font-black tabular-nums">{value}</div>
                  </div>
                ))}
              </div>
              {!data.queue.online && <Notice tone="error">Docker or the OpenFOAM image ({data.image}) is not available on the server. Students can browse solved runs but cannot start new ones.</Notice>}

              <section className="panel overflow-hidden">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <h2 className="text-[17px] font-bold">Reference solutions</h2>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void act(() => api.adminRebake(false), 'Missing reference solutions queued.')}><RefreshCw size={15} /> Solve missing</Button>
                    <Button size="sm" variant="danger" onClick={() => { if (window.confirm('Re-solve every reference case? Students keep their own runs.')) void act(() => api.adminRebake(true), 'All reference solutions queued.') }}>Re-solve all</Button>
                  </div>
                </div>
                <table className="w-full text-left text-[14.5px]">
                  <thead className="border-b bg-[#fafbfc] text-[12.5px] tracking-wide text-muted-foreground uppercase"><tr><th className="px-4 py-2 font-bold">Tutorial</th><th className="px-4 py-2 font-bold">Status</th><th className="px-4 py-2 font-bold">Cells</th><th className="px-4 py-2 font-bold">Solve time</th></tr></thead>
                  <tbody>
                    {data.tutorials.map((tutorial) => (
                      <tr key={tutorial.id} className="border-b last:border-b-0">
                        <td className="px-4 py-2.5 font-bold">{tutorial.title}</td>
                        <td className="px-4 py-2.5">
                          <Badge tone={tutorial.reference.status === 'succeeded' ? 'success' : tutorial.reference.status === 'failed' ? 'danger' : 'warning'}>{tutorial.reference.status}</Badge>
                          {tutorial.reference.reason && tutorial.reference.status !== 'succeeded' && <span className="ml-2 text-[13px] text-muted-foreground">{tutorial.reference.reason}</span>}
                        </td>
                        <td className="px-4 py-2.5 tabular-nums">{tutorial.reference.cells?.toLocaleString() ?? '–'}</td>
                        <td className="px-4 py-2.5 tabular-nums">{tutorial.reference.durationMs ? formatDuration(tutorial.reference.durationMs) : '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              {data.queue.jobs.length > 0 && (
                <section className="panel overflow-hidden">
                  <div className="border-b px-4 py-3"><h2 className="text-[17px] font-bold">Compute queue</h2></div>
                  <table className="w-full text-left text-[14.5px]">
                    <tbody>
                      {data.queue.jobs.map((job) => (
                        <tr key={job.id} className="border-b last:border-b-0">
                          <td className="px-4 py-2.5 font-bold">{data.tutorials.find((tutorial) => tutorial.id === job.tutorialId)?.title ?? job.tutorialId}</td>
                          <td className="px-4 py-2.5">{job.state === 'running' ? `${job.stage ?? 'starting'} · ${Math.round(job.progress * 100)}%` : `queued (#${job.position})`}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{job.requesters.map((id) => id === '__reference__' ? 'reference' : data.students.find((student) => student.id === id)?.name ?? id).join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              <section className="panel overflow-hidden">
                <div className="border-b px-4 py-3"><h2 className="text-[17px] font-bold">Students</h2></div>
                {data.students.length === 0 ? <p className="p-4 text-muted-foreground">No one has joined yet. Share the site address and the class code.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[14.5px]">
                      <thead className="border-b bg-[#fafbfc] text-[12.5px] tracking-wide text-muted-foreground uppercase">
                        <tr>
                          <th className="px-4 py-2 font-bold">Name</th><th className="px-4 py-2 font-bold">Last seen</th>
                          {data.tutorials.map((tutorial) => <th key={tutorial.id} className="px-3 py-2 font-bold" title={tutorial.title}>{tutorial.title.split(' ').slice(0, 2).join(' ')}</th>)}
                          <th className="px-4 py-2 font-bold">Today</th><th className="px-4 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {data.students.map((student) => (
                          <tr key={student.id} className="border-b last:border-b-0">
                            <td className="px-4 py-2.5 font-bold">{student.name}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{timeAgo(student.lastSeenAt)}</td>
                            {data.tutorials.map((tutorial) => {
                              const progress = student.tutorials[tutorial.id]
                              return <td key={tutorial.id} className="px-3 py-2.5 tabular-nums">{progress ? (progress.runs ? <Badge tone="success">{progress.succeeded}/{progress.runs} runs</Badge> : <Badge>opened</Badge>) : <span className="text-[#b3bcc5]">–</span>}</td>
                            })}
                            <td className="px-4 py-2.5 tabular-nums">{student.runsToday}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex justify-end gap-1">
                                <button type="button" title="Set a new PIN" aria-label={`Set a new PIN for ${student.name}`} className="flex h-8 w-8 items-center justify-center rounded hover:bg-muted" onClick={() => { const pin = window.prompt(`New PIN for ${student.name} (at least 4 characters):`); if (pin) void act(() => api.adminResetPin(student.id, pin), `PIN updated for ${student.name}.`) }}><KeyRound size={15} /></button>
                                <button type="button" title="Remove student" aria-label={`Remove ${student.name}`} className="flex h-8 w-8 items-center justify-center rounded text-danger hover:bg-danger-bg" onClick={() => { if (window.confirm(`Remove ${student.name} and all of their runs? This cannot be undone.`)) void act(() => api.adminRemoveStudent(student.id), `${student.name} removed.`) }}><Trash2 size={15} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
