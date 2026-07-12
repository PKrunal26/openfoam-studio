import { useEffect, useState } from 'react'
import { Plus, Trash2, Settings as SettingsIcon } from 'lucide-react'
import * as api from '@/lib/api'
import { navigate } from '@/lib/router'
import { cn } from '@/lib/cn'

interface Props {
  onOpenSettings: () => void
}

export function ProjectGrid({ onOpenSettings }: Props) {
  const [projects, setProjects] = useState<api.ProjectMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')

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
    if (!name.trim()) return
    try {
      const p = await api.createProject(name.trim(), prompt.trim())
      setName('')
      setPrompt('')
      setCreating(false)
      navigate({ name: 'project', id: p.id })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const onDelete = async (id: string, displayName: string) => {
    if (!confirm(`Delete project "${displayName}"? This cannot be undone.`)) return
    try {
      await api.deleteProject(id)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
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

      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-medium">Projects</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {loading ? 'Loading…' : `${projects.length} case${projects.length === 1 ? '' : 's'}`}
              </p>
            </div>
            <button
              onClick={() => setCreating(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" />
              New project
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
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
                    disabled={!name.trim()}
                    className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          )}

          {projects.length === 0 && !loading && !creating ? (
            <div className="rounded-lg border border-dashed py-16 text-center">
              <p className="text-sm text-muted-foreground">No projects yet.</p>
              <button
                onClick={() => setCreating(true)}
                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-3.5 w-3.5" />
                Create your first project
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
                  onClick={() => navigate({ name: 'project', id: p.id })}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-medium">{p.name}</h3>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {new Date(p.createdAt).toLocaleDateString()} · {p.status}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(p.id, p.name)
                      }}
                      title="Delete project"
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
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
