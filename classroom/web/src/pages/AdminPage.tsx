import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, KeyRound, RefreshCw, Trash2 } from 'lucide-react'
import { api, type AdminOverview } from '@c/api'
import { navigate } from '@c/router'
import { useSession, useToasts } from '@c/store'
import { Button, Notice, Spinner, Tag, Wordmark, formatDuration, timeAgo } from '@c/ui/primitives'

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
    <div className="flex h-full flex-col px-8 py-8 sm:px-14">
      <Wordmark size="lg" />
      <form onSubmit={submit} className="my-auto w-full max-w-[380px] py-10">
        <p className="t-eyebrow">Instructor</p>
        <h1 className="t-display mt-3 text-[40px]">Sign in</h1>
        <label className="mt-8 block">
          <span className="mb-1.5 block text-[13px] font-medium">Instructor code</span>
          <input type="password" autoFocus required value={code} onChange={(e) => setCode(e.target.value)} className="h-11 w-full border border-line-strong px-3 font-mono text-[15px] outline-none hover:border-ink focus:border-primary focus:ring-1 focus:ring-primary" />
        </label>
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
        <Button type="submit" variant="primary" size="lg" className="mt-6 w-full" disabled={busy}>{busy && <Spinner />} Sign in</Button>
        <button type="button" className="mt-5 text-[13px] text-ink-3 underline-offset-4 hover:text-ink hover:underline" onClick={() => navigate('/')}>Back to the classroom</button>
      </form>
    </div>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-ink pt-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="t-title text-[19px]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

const TH = 't-eyebrow pb-2 pr-4 text-left font-medium'

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
    return <div className="flex h-full flex-col items-center justify-center gap-3"><p className="t-title text-[20px]">Instructor access is not enabled on this server</p><p className="text-ink-3">Set OFS_INSTRUCTOR_CODE and restart the server.</p><Button onClick={() => navigate('/')}>Back</Button></div>
  }
  if (!info.instructor) return <Login onDone={() => void refreshSession()} />

  const act = async (work: () => Promise<unknown>, done: string) => {
    try { await work(); push('success', done); void load() } catch (e) { push('error', (e as Error).message) }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[52px] shrink-0 items-center gap-4 border-b px-5">
        <Wordmark />
        <Tag tone="ink">Instructor</Tag>
        <div className="flex-1" />
        <Button size="sm" onClick={() => navigate('/')}><ArrowLeft size={14} /> Classroom</Button>
      </header>
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[1240px] space-y-12 px-6 pb-16 pt-10 sm:px-10">
          <div>
            <p className="t-eyebrow">{info.className}</p>
            <h1 className="t-display mt-3 text-[44px]">Overview</h1>
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          {!data && !error && <div className="flex items-center gap-3 text-ink-3"><Spinner /> Loading</div>}
          {data && (
            <>
              <dl className="grid grid-cols-2 gap-x-8 gap-y-6 lg:grid-cols-4">
                {[
                  ['Students', String(data.students.length)],
                  ['Solver slots busy', data.queue.online ? `${data.queue.running} / ${data.queue.slots}` : 'offline'],
                  ['Queued runs', String(data.queue.queued)],
                  ['Stored results', `${(data.cache.bytes / 1e9).toFixed(2)} / ${(data.cache.maxBytes / 1e9).toFixed(0)} GB`],
                ].map(([label, value]) => (
                  <div key={label} className="border-t pt-3">
                    <dt className="t-eyebrow">{label}</dt>
                    <dd className="t-display mt-2 text-[30px] tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              {!data.queue.online && <Notice tone="error">Docker or the OpenFOAM image ({data.image}) is not available on the server. Students can browse solved runs but cannot start new ones.</Notice>}

              <Section
                title="Reference solutions"
                action={(
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void act(() => api.adminRebake(false), 'Missing reference solutions queued.')}><RefreshCw size={13} /> Solve missing</Button>
                    <Button size="sm" variant="danger" onClick={() => { if (window.confirm('Re-solve every reference case? Students keep their own runs.')) void act(() => api.adminRebake(true), 'All reference solutions queued.') }}>Re-solve all</Button>
                  </div>
                )}
              >
                <table className="w-full text-[13.5px]">
                  <thead><tr><th className={TH}>Tutorial</th><th className={TH}>Status</th><th className={TH}>Cells</th><th className={TH}>Solve time</th></tr></thead>
                  <tbody>
                    {data.tutorials.map((tutorial) => (
                      <tr key={tutorial.id} className="border-t">
                        <td className="py-2.5 pr-4 font-medium">{tutorial.title}</td>
                        <td className="py-2.5 pr-4">
                          <Tag tone={tutorial.reference.status === 'succeeded' ? 'ok' : tutorial.reference.status === 'failed' ? 'bad' : 'warn'}>{tutorial.reference.status}</Tag>
                          {tutorial.reference.reason && tutorial.reference.status !== 'succeeded' && <span className="ml-2 text-[12.5px] text-ink-3">{tutorial.reference.reason}</span>}
                        </td>
                        <td className="t-mono py-2.5 pr-4">{tutorial.reference.cells?.toLocaleString() ?? '–'}</td>
                        <td className="t-mono py-2.5">{tutorial.reference.durationMs ? formatDuration(tutorial.reference.durationMs) : '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>

              {data.queue.jobs.length > 0 && (
                <Section title="Compute queue">
                  <table className="w-full text-[13.5px]">
                    <tbody>
                      {data.queue.jobs.map((job) => (
                        <tr key={job.id} className="border-t first:border-t-0">
                          <td className="py-2.5 pr-4 font-medium">{data.tutorials.find((tutorial) => tutorial.id === job.tutorialId)?.title ?? job.tutorialId}</td>
                          <td className="t-mono py-2.5 pr-4">{job.state === 'running' ? `${job.stage ?? 'starting'} ${Math.round(job.progress * 100)}%` : `queued #${job.position}`}</td>
                          <td className="py-2.5 text-ink-3">{job.requesters.map((id) => id === '__reference__' ? 'reference' : data.students.find((student) => student.id === id)?.name ?? id).join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Section>
              )}

              <Section title="Students">
                {data.students.length === 0 ? <p className="text-ink-3">No one has joined yet. Share the site address and the class code.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13.5px]">
                      <thead>
                        <tr>
                          <th className={TH}>Name</th><th className={TH}>Last seen</th>
                          {data.tutorials.map((tutorial, index) => <th key={tutorial.id} className={TH} title={tutorial.title}>{String(index + 1).padStart(2, '0')}</th>)}
                          <th className={TH}>Today</th><th />
                        </tr>
                      </thead>
                      <tbody>
                        {data.students.map((student) => (
                          <tr key={student.id} className="group border-t">
                            <td className="py-2.5 pr-4 font-medium">{student.name}</td>
                            <td className="py-2.5 pr-4 text-ink-3">{timeAgo(student.lastSeenAt)}</td>
                            {data.tutorials.map((tutorial) => {
                              const progress = student.tutorials[tutorial.id]
                              return (
                                <td key={tutorial.id} className="t-mono py-2.5 pr-4" title={progress ? `${tutorial.title}: ${progress.succeeded} solved of ${progress.runs} runs` : `${tutorial.title}: not opened`}>
                                  {progress ? (progress.runs ? <span className="flex items-center gap-1.5"><span className="h-2 w-2 bg-ok" />{progress.succeeded}/{progress.runs}</span> : <span className="flex items-center gap-1.5 text-ink-3"><span className="h-2 w-2 bg-line-strong" />open</span>) : <span className="text-ink-4">–</span>}
                                </td>
                              )
                            })}
                            <td className="t-mono py-2.5 pr-4">{student.runsToday}</td>
                            <td className="py-1">
                              <div className="flex justify-end">
                                <button type="button" title="Set a new PIN" aria-label={`Set a new PIN for ${student.name}`} className="flex h-8 w-8 items-center justify-center text-ink-3 hover:bg-wash hover:text-ink" onClick={() => { const pin = window.prompt(`New PIN for ${student.name} (at least 4 characters):`); if (pin) void act(() => api.adminResetPin(student.id, pin), `PIN updated for ${student.name}.`) }}><KeyRound size={14} /></button>
                                <button type="button" title="Remove student" aria-label={`Remove ${student.name}`} className="flex h-8 w-8 items-center justify-center text-ink-3 hover:bg-bad-tint hover:text-bad" onClick={() => { if (window.confirm(`Remove ${student.name} and all of their runs? This cannot be undone.`)) void act(() => api.adminRemoveStudent(student.id), `${student.name} removed.`) }}><Trash2 size={14} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="t-mono mt-3 text-[11px] text-ink-3">Columns 01 to {String(data.tutorials.length).padStart(2, '0')} are the tutorials, in order: solved runs / runs kept.</p>
                  </div>
                )}
              </Section>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
