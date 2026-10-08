import { backendFetch } from './backendFetch'
import { backendUrl } from './backendUrl'

export interface ProjectMeta {
  id: string
  name: string
  prompt: string
  status: 'idle' | 'generating' | 'running' | 'ready' | 'done' | 'error' | 'draft' | 'needs-input' | 'unvalidated' | 'validation-failed' | 'interrupted'
  createdAt: string
  example?: boolean
  retryCount?: number
  messages?: Array<{
    role: string
    content: string
    ts?: string
    /** Server-side field name; ts kept for older payloads. */
    timestamp?: string
    filesChanged?: string[]
    agentSteps?: Array<{ tool: string; summary?: string; ok: boolean; durationMs?: number }>
  }>
}

export interface CaseFile {
  relPath: string
}

export interface Settings {
  provider: 'codex-cli' | 'claude-cli' | 'anthropic' | 'openai' | 'google' | 'openai-compatible'
  model: string
  customBaseURL: string
  hasAuth: boolean
  hasKeys: Record<string, boolean>
  providers: Array<{
    id: Settings['provider']
    label: string
    defaultModel: string
    models?: Array<{ id: string; label: string }>
  }>
}

async function jsonOr<T>(res: Response, fallback: T): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  try {
    return (await res.json()) as T
  } catch {
    return fallback
  }
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const res = await backendFetch(backendUrl('/api/projects'))
  return jsonOr<ProjectMeta[]>(res, [])
}

export async function createProject(name: string, prompt: string, starter?: 'cavity' | 'solved-cavity'): Promise<ProjectMeta> {
  const res = await backendFetch(backendUrl('/api/projects'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, prompt, starter }),
  })
  if (!res.ok) throw new Error(`Failed to create project: ${res.status}`)
  return res.json()
}

export async function getProject(id: string): Promise<ProjectMeta | null> {
  const res = await backendFetch(backendUrl(`/api/projects/${id}`))
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to load project: ${res.status}`)
  return res.json()
}

export async function deleteProject(id: string): Promise<void> {
  const res = await backendFetch(backendUrl(`/api/projects/${id}`), { method: 'DELETE' })
  if (!res.ok && res.status !== 404) throw new Error(`Failed to delete: ${res.status}`)
}

export async function importProject(file: File): Promise<ProjectMeta> {
  if (file.size > 192 * 1024 * 1024) throw new Error('This project export exceeds the 192 MiB import limit.')
  const content = await file.text()
  try { JSON.parse(content) } catch { throw new Error('Choose an OpenFOAM Studio JSON project export.') }
  const res = await backendFetch(backendUrl('/api/projects/import'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: content,
  })
  if (!res.ok) throw new Error(`Could not import project: ${await res.text().catch(() => String(res.status))}`)
  return res.json()
}

export async function listFiles(id: string): Promise<CaseFile[]> {
  const res = await backendFetch(backendUrl(`/api/projects/${id}/files`))
  return jsonOr<CaseFile[]>(res, [])
}

export async function readFile(id: string, relPath: string): Promise<string> {
  const res = await backendFetch(backendUrl(`/api/projects/${id}/file?path=${encodeURIComponent(relPath)}`))
  if (!res.ok) throw new Error(`Failed to read ${relPath}: ${res.status}`)
  return res.text()
}

export class FileConflictError extends Error {}

export async function writeFile(id: string, relPath: string, content: string, expectedContent?: string): Promise<void> {
  const res = await backendFetch(backendUrl(`/api/projects/${id}/file?path=${encodeURIComponent(relPath)}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, expectedContent }),
  })
  if (res.status === 409 || res.status === 412) throw new FileConflictError(`The disk version of ${relPath} changed. Reload it and reconcile your edits before saving.`)
  if (!res.ok) throw new Error(`Failed to write ${relPath}: ${res.status}`)
}

export interface RunRecord {
  id: string
  startedAt: string
  finishedAt?: string
  status: 'running' | 'success' | 'failed' | 'aborted' | 'exhausted' | 'reference'
  exits: { cmd: string; code: number }[]
  errorMessage?: string
}

export interface CommandRecord {
  runId: string
  ts: string
  cmd: string
  args: string[]
  status: 'success' | 'failed' | 'error'
  exitCode?: number
  durationMs: number
  errorMessage?: string
}

export async function listRuns(id: string): Promise<RunRecord[]> {
  const res = await backendFetch(backendUrl(`/api/projects/${id}/runs`))
  return jsonOr<RunRecord[]>(res, [])
}

export async function listCommands(id: string, limit = 200): Promise<CommandRecord[]> {
  const res = await backendFetch(backendUrl(`/api/projects/${id}/commands?limit=${limit}`))
  return jsonOr<CommandRecord[]>(res, [])
}

export async function getRunLog(id: string, runId: string): Promise<string> {
  const res = await backendFetch(backendUrl(`/api/projects/${id}/runs/${runId}/log`))
  if (!res.ok) throw new Error(`Failed to load run log: ${res.status}`)
  return res.text()
}

export interface VtkFile {
  relPath: string
  size: number
  ext: string
  /** Actual time value (foamToVTK -useTimeName) or write index; null if unknown. */
  time: number | null
  kind: string
  patchName: string | null
}

export interface VtkSeriesStep {
  time: number
  internal?: string
  patches: Record<string, string>
}

export interface VtkSeries {
  times: number[]
  steps: VtkSeriesStep[]
}

export interface VtkManifest {
  runId?: string | null
  inputRevision?: string | null
  currentRevision?: string | null
  stale?: boolean
  validation?: unknown
  files: VtkFile[]
  series: VtkSeries
}

const EMPTY_VTK_MANIFEST: VtkManifest = { files: [], series: { times: [], steps: [] } }

export async function getVtkManifest(id: string, runId?: string | null): Promise<VtkManifest> {
  const res = await backendFetch(backendUrl(`/api/projects/${id}/vtk/manifest${runId ? `?runId=${encodeURIComponent(runId)}` : ''}`))
  if (!res.ok) throw new Error(`Failed to load results: ${res.status}`)
  const json = (await res.json().catch(() => null)) as Partial<VtkManifest> | null
  return {
    ...json,
    files: json?.files ?? [],
    series: json?.series ?? EMPTY_VTK_MANIFEST.series,
  }
}

export function postprocessUrl(id: string): string {
  return backendUrl(`/api/projects/${id}/postprocess`)
}

export function vtkFileUrl(id: string, relPath: string, runId?: string | null): string {
  return backendUrl(`/api/projects/${id}/vtk/file?path=${encodeURIComponent(relPath)}${runId ? `&runId=${encodeURIComponent(runId)}` : ''}`)
}

export type HealthCheckName = 'backend' | 'docker' | 'image' | 'codex_cli' | 'codex_auth' | 'claude_cli' | 'claude_auth'

export interface HealthCheck {
  name: HealthCheckName
  label: string
  pass: boolean
  fix: string
  commands?: string[]
  canAutoFix: boolean
}

export interface HealthResult {
  ok: boolean
  checks: HealthCheck[]
}

/**
 * Server-side health probes are capped at ~5s per Docker round trip, so a
 * healthy backend always answers well inside this. The ceiling exists for the
 * case where the backend itself is wedged — without it the request stays
 * pending for the life of the window and the setup modal never renders.
 */
const HEALTH_TIMEOUT_MS = 20_000

export async function getHealth(
  opts: { timeoutMs?: number } = {},
): Promise<HealthResult> {
  const res = await backendFetch(backendUrl('/health'), {
    signal: AbortSignal.timeout(opts.timeoutMs ?? HEALTH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`)
  return res.json()
}

export async function getSettings(): Promise<Settings> {
  const res = await backendFetch(backendUrl('/settings'))
  if (!res.ok) throw new Error(`Failed to load settings: ${res.status}`)
  return res.json()
}

export async function updateSettings(payload: {
  provider?: string
  model?: string
  apiKey?: string
  customBaseURL?: string
  removeApiKeys?: string[]
}): Promise<{ ok: boolean; hasAuth: boolean }> {
  const res = await backendFetch(backendUrl('/settings'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Settings update failed: ${res.status} ${txt}`)
  }
  return res.json()
}

export async function testSettings(signal?: AbortSignal): Promise<{ ok: boolean; message: string }> {
  const res = await backendFetch(backendUrl('/settings/test'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal })
  if (!res.ok) throw new Error(`Connection test failed: ${res.status}`)
  return res.json()
}
export function projectExportUrl(id: string): string { return backendUrl(`/api/projects/${id}/export`) }
export function projectSupportUrl(id: string): string { return backendUrl(`/api/projects/${id}/support`) }

export async function renameProject(id: string, name: string): Promise<ProjectMeta> {
  const res = await backendFetch(backendUrl(`/api/projects/${id}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
  if (!res.ok) throw new Error(`Could not rename project: ${res.status}`)
  return res.json()
}
