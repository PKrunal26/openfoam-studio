import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Settings as SettingsIcon } from 'lucide-react'
import * as api from '@/lib/api'
import { navigate } from '@/lib/router'
import { useDialogFocus } from '@/hooks/useDialogFocus'
import { cn } from '@/lib/cn'

interface Props {
  onOpenSettings: () => void
  inspectMode?: boolean
  onOpenSetup: () => void
}

const STATUS_DOT: Record<api.ProjectMeta['status'], string> = {
  idle: 'bg-muted-foreground/50',
  generating: 'bg-blue-400',
  running: 'bg-blue-400',
  ready: 'bg-amber-400',
  done: 'bg-emerald-500',
  error: 'bg-destructive',
  draft: 'bg-muted-foreground/50',
  'needs-input': 'bg-amber-400',
  unvalidated: 'bg-amber-400',
  'validation-failed': 'bg-destructive',
  interrupted: 'bg-amber-400',
}

export function ProjectGrid({ onOpenSettings, inspectMode, onOpenSetup }: Props) {
  const [projects, setProjects] = useState<api.ProjectMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const deleteDialog = useRef<HTMLDivElement>(null)
  const importInput = useRef<HTMLInputElement>(null)
  useDialogFocus(deleteDialog, !!confirmDelete, () => { if (!busy) setConfirmDelete(null) })

  const refresh = async () => {
    setLoading(true)
    try {
      setProjects(await api.listProjects())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const onCreate = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      const p = await api.createProject(name.trim(), prompt.trim())
      setName('')
      setPrompt('')
      setCreating(false)
      navigate({ name: 'project', id: p.id })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setBusy(false) }
  }

  const onStarter = async (starter: 'cavity' | 'solved-cavity' = 'cavity') => {
    if (busy) return
    setBusy(true); setError(null)
    try { const p = await api.createProject(starter === 'cavity' ? 'Lid-driven cavity · Re 100' : 'Cavity example (reference data)', '', starter); navigate({ name: 'project', id: p.id }) }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setBusy(false) }
  }

  const onImport = async (file: File | undefined) => {
    if (!file || busy) return
    setBusy(true); setError(null)
    try {
      const project = await api.importProject(file)
      navigate({ name: 'project', id: project.id })
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setBusy(false); if (importInput.current) importInput.current.value = '' }
  }

  const onDelete = async (id: string) => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      await api.deleteProject(id)
      setConfirmDelete(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setBusy(false) }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex h-11 shrink-0 items-center justify-between border-b px-4">
        <span className="text-sm font-medium">OpenFOAM Studio</span>
        <button
          onClick={onOpenSettings}
          className="flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <SettingsIcon className="h-3.5 w-3.5" />
          Settings
        </button>
      </header>

      {confirmDelete && <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
        <div ref={deleteDialog} role="dialog" aria-modal="true" aria-labelledby="delete-project-title" className="w-full max-w-md rounded-lg border bg-card p-6">
          <h2 id="delete-project-title" className="text-base font-medium">Move {projects.find((p) => p.id === confirmDelete)?.name} to trash?</h2>
          <p className="mt-2 text-sm text-muted-foreground">This removes the project from this list. Its files remain in the application’s project trash for manual recovery. Export a copy first if you need a portable backup.</p>
          {error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}
          <div className="mt-5 flex justify-end gap-2"><button disabled={busy} className="rounded border px-3 py-2 text-xs" onClick={() => setConfirmDelete(null)}>Keep project</button><button disabled={busy} className="rounded bg-destructive px-3 py-2 text-xs text-white" onClick={() => void onDelete(confirmDelete)}>{busy ? 'Moving…' : 'Move to trash'}</button></div>
        </div>
      </div>}
      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-5xl">
          {inspectMode && <div className="mb-6 flex items-center justify-between rounded border p-3 text-xs text-muted-foreground"><span>Inspect mode · Setup is incomplete.</span><button onClick={onOpenSetup} className="rounded border px-3 py-1">Open setup</button></div>}
          {!loading && (projects.length === 0 || inspectMode) && <section className="mb-8 grid gap-6 border-b pb-8 sm:grid-cols-[1.3fr_1fr]">
            <div><p className="text-xs text-muted-foreground">Your first simulation</p><h1 className="mt-2 text-3xl font-medium tracking-tight">From a case to a flow field.</h1><p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">Start with a small, editable lid-driven cavity. Review the inputs, check the mesh, solve locally, then inspect velocity and residuals.</p><button disabled={busy} onClick={() => void onStarter()} className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? 'Creating case…' : 'Start the supported cavity'}</button><p className="mt-2 text-[11px] text-muted-foreground">Creates case files locally. No AI request required.</p><button disabled={busy} onClick={() => void onStarter('solved-cavity')} className="mt-3 text-xs underline underline-offset-4">Inspect the bundled cavity example</button><p className="mt-1 text-[11px] text-muted-foreground">Reference visualization data; does not run or validate your inputs.</p></div>
            <div className="rounded-lg bg-muted/40 p-5"><h2 className="text-sm font-medium">Simulation brief</h2><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><dt className="text-muted-foreground">Physics</dt><dd>Laminar, incompressible</dd><dt className="text-muted-foreground">Reynolds number</dt><dd className="font-mono">100</dd><dt className="text-muted-foreground">Geometry</dt><dd>Square cavity, 2D</dd><dt className="text-muted-foreground">Boundary</dt><dd>Moving lid, fixed walls</dd></dl><p className="mt-5 text-[11px] leading-relaxed text-muted-foreground">This alpha journey demonstrates OpenFOAM 13 setup and execution. Review benchmark evidence before drawing engineering conclusions. Other physics remain experimental.</p></div>
          </section>}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-medium">Projects</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {loading ? 'Loading…' : `${projects.length} case${projects.length === 1 ? '' : 's'}`}
              </p>
            </div>
            <div className="flex gap-2">
            <input ref={importInput} type="file" accept=".json,application/json" className="hidden" aria-label="Choose project export" onChange={(e) => void onImport(e.target.files?.[0])} />
            <button disabled={busy} onClick={() => importInput.current?.click()} className="h-8 rounded-md border px-3 text-xs disabled:opacity-50">Import project</button>
            <button
              onClick={() => setCreating(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" />
              New project
            </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}<button className="ml-3 rounded border px-2 py-1" onClick={() => void refresh()}>Retry project list</button>
            </div>
          )}

          {creating && (
            <div className="mb-6 rounded-lg border bg-card p-4">
              <h2 className="text-sm font-medium">New project</h2>
              <div className="mt-3 grid gap-3">
                <label className="grid gap-1">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Name
                  </span>
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onCreate() }}
                    placeholder="Lid-driven cavity"
                    className="h-8 rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Initial prompt (optional)
                  </span>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe the simulation in plain English…"
                    rows={3}
                    className="rounded-md border bg-background px-2.5 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  />
                </label>
                <div className="mt-1 flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setCreating(false)
                      setName('')
                      setPrompt('')
                    }}
                    className="h-8 rounded-md border px-3 text-xs hover:bg-accent"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onCreate}
                    disabled={!name.trim() || busy}
                    className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {busy ? 'Creating…' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {projects.length === 0 && !loading && !creating ? (
            <div className="rounded-lg border border-dashed py-16 text-center">
              <p className="text-sm text-muted-foreground">Your cases will appear here.</p>
              <button
                onClick={() => setCreating(true)}
                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-3.5 w-3.5" />
                Describe your own case
              </button>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <li
                  key={p.id}
                  className={cn(
                    'group relative flex cursor-pointer flex-col rounded-lg border bg-card p-4 hover:border-foreground/30',
                  )}
                  role="link"
                  tabIndex={0}
                  aria-label={`Open ${p.name}`}
                  onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); navigate({ name: 'project', id: p.id }) } }}
                  onClick={() => navigate({ name: 'project', id: p.id })}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-medium">{p.name}</h3>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[p.status])} />
                        {new Date(p.createdAt).toLocaleDateString()} · {p.status}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirmDelete(p.id)
                      }}
                      aria-label={confirmDelete === p.id ? `Confirm delete ${p.name}` : `Delete ${p.name}`}
                      title="Delete project"
                      className={cn(
                        'transition-opacity focus-visible:opacity-100',
                        confirmDelete === p.id
                          ? 'flex items-center gap-1 rounded border border-destructive/50 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive opacity-100'
                          : 'opacity-0 group-hover:opacity-100',
                      )}
                    >
                      <Trash2 className={cn('h-3.5 w-3.5', confirmDelete === p.id ? 'text-destructive' : 'text-muted-foreground hover:text-destructive')} />
                      {confirmDelete === p.id && 'Delete?'}
                    </button>
                  </div>
                  {p.prompt && (
                    <p className="mt-3 line-clamp-3 text-xs text-muted-foreground">{p.prompt}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}
