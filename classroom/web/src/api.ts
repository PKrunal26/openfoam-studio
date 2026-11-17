// Typed client for the classroom server (classroom/server/server.ts).

export type Value = number | string

export interface ParamDef {
  id: string
  label: string
  symbol?: string
  unit?: string
  type: 'number' | 'select'
  default: Value
  min?: number
  max?: number
  integer?: boolean
  options?: { value: Value; label: string }[]
  help?: string
}

export interface DerivedDef {
  id: string
  label: string
  symbol?: string
  unit?: string
  digits?: number
  help?: string
}

export type SectionNode =
  | 'model' | 'materials' | 'initialConditions' | 'boundaryConditions'
  | 'numerics' | 'simulationControl' | 'mesh'

export interface SettingItem {
  id: string
  label: string
  icon?: string
  description?: string
  patches?: string[]
  files?: string[]
  rows?: { label: string; value: string }[]
  params?: string[]
  derived?: string[]
}

export interface PatchDef {
  name: string
  label: string
  kind: 'inlet' | 'outlet' | 'wall' | 'movingWall' | 'open' | 'empty'
}

export interface TutorialDef {
  id: string
  order: number
  title: string
  subtitle: string
  summary: string
  difficulty: string
  analysisType: string
  solver: string
  dimension: '2D' | '3D'
  tags: string[]
  estimatedRuntime: string
  geometry: { name: string; description: string; patches: PatchDef[] }
  params: ParamDef[]
  derived: DerivedDef[]
  sections: { node: SectionNode; items: SettingItem[] }[]
  run: { maxWallSeconds: number; fields: string[]; steady: boolean }
  results: {
    defaultField: string
    fields: Record<string, { label: string; unit: string }>
    view: string
    slice?: { normal: [number, number, number]; origin: [number, number, number] }
  }
}

export type RunStatus = 'succeeded' | 'failed' | 'queued' | 'running' | 'cancelled' | 'error' | 'interrupted' | 'missing'
export type StageName = 'mesh' | 'initialise' | 'solve' | 'export'

export interface JobView {
  id: string
  hash: string
  tutorialId: string
  state: 'queued' | 'running'
  stage: StageName | null
  progress: number
  position: number
  queuedAt: number
  startedAt: number | null
}

export interface RunView {
  id: string
  number: number
  label: string
  isReference: boolean
  createdAt: string | null
  hash: string
  status: RunStatus
  reason: string | null
  job: JobView | null
  result: { cells: number | null; finalTime: number | null; durationMs: number; converged: boolean; failedStage: string | null } | null
  changed: Record<string, Value>
  overridden: string[]
}

export interface Issue { level: 'error' | 'warning'; message: string; param?: string }

export interface WorkspaceView {
  values: Record<string, Value>
  derived: Record<string, number>
  issues: Issue[]
  changed: string[]
  overrides: string[]
  runs: RunView[]
  matchesRun: string | null
  limits: { maxRuns: number; runsUsed: number; runsToday: number; maxRunsPerDay: number }
}

export interface TutorialSummary {
  id: string
  order: number
  title: string
  subtitle: string
  summary: string
  difficulty: string
  analysisType: string
  solver: string
  dimension: string
  tags: string[]
  estimatedRuntime: string
  hasThumbnail: boolean
  reference: { status: RunStatus; cells: number | null; progress: number | null }
  mine: { runs: number; openedAt: string; updatedAt: string } | null
}

export interface SessionInfo {
  className: string
  student: { id: string; name: string } | null
  requiresClassCode: boolean
  instructor: boolean
  instructorEnabled: boolean
}

export interface CaseFile { relPath: string; content: string; generated?: string; overridden?: boolean }

export interface Convergence {
  times: number[]
  residuals: Record<string, (number | null)[]>
  courantMax: (number | null)[]
  steps: number
  live: boolean
  monitors: { title: string; yLabel: string; times: number[]; series: { label: string; values: (number | null)[] }[] }[]
}

export interface VtkSeriesStep { time: number; internal?: string; patches: Record<string, string> }
/** field name → component selector as a string → [min, max] over the whole run. */
export type FieldRangeTable = Record<string, Record<string, [number, number]>>
export interface VtkManifest {
  hash: string
  files: { relPath: string; size: number }[]
  series: { times: number[]; steps: VtkSeriesStep[] }
  /** Present once the server has computed it; saves downloading every step. */
  ranges?: FieldRangeTable
}

export interface LogChunk { lines: string[]; start?: number; next: number; done: boolean; total: number | null }

export interface AdminOverview {
  className: string
  image: string
  queue: { running: number; queued: number; slots: number; online: boolean; jobs: (JobView & { requesters: string[] })[] }
  cache: { entries: number; bytes: number; maxBytes: number }
  tutorials: { id: string; title: string; reference: { status: RunStatus; reason: string | null; durationMs: number | null; cells: number | null } }[]
  students: {
    id: string; name: string; createdAt: string; lastSeenAt: string; runsToday: number
    tutorials: Record<string, { runs: number; succeeded: number; openedAt: string; updatedAt: string }>
  }[]
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message) }
}

/**
 * Static preview build (VITE_STATIC_DEMO=1): no server. Reads come from JSON
 * exported next to the page; anything that would change state is refused.
 */
export const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === '1'
const READ_ONLY = 'This is a read-only preview. Changing settings and running simulations need the live classroom server.'

async function staticRequest(method: string, path: string): Promise<unknown> {
  const load = async (file: string) => {
    const response = await fetch(`data/${file}`)
    if (!response.ok) throw new ApiError(response.status, 'Not available in this preview.')
    return response.json()
  }
  if (method !== 'GET') {
    if (path === '/session/logout') return { ok: true }
    throw new ApiError(403, READ_ONLY)
  }
  if (path === '/session') return { className: 'Interactive preview', student: { id: 'preview', name: 'Preview Student' }, requiresClassCode: false, instructor: false, instructorEnabled: false }
  if (path === '/status') return { compute: { online: false, running: 0, queued: 0, slots: 0 }, mine: [] }
  if (path === '/tutorials') return load('tutorials.json')
  const match = /^\/tutorials\/([^/]+)(\/[^?]*)?/.exec(path)
  if (!match) throw new ApiError(404, 'Not available in this preview.')
  const [, id, rest = ''] = match
  if (rest === '') return load(`${id}/tutorial.json`)
  if (rest === '/workspace') return ((await load(`${id}/tutorial.json`)) as { workspace: unknown }).workspace
  if (rest === '/files' || rest === '/runs/reference/files') return load(`${id}/files.json`)
  if (rest === '/runs/reference/log') return load(`${id}/log.json`)
  if (rest === '/runs/reference/convergence') return load(`${id}/convergence.json`)
  if (rest === '/runs/reference/vtk/manifest') return load(`${id}/manifest.json`)
  throw new ApiError(404, 'Not available in this preview.')
}

/** Text of one result VTK file. */
export async function fetchVtkText(tutorialId: string, runId: string, relPath: string, hash: string): Promise<string> {
  if (STATIC_DEMO) {
    const response = await fetch(`data/${tutorialId}/vtk/${relPath.replace(/\//g, '__')}.txt`)
    if (!response.ok) throw new Error(`Could not load result file (${response.status})`)
    return response.text()
  }
  const response = await fetch(api.vtkUrl(tutorialId, runId, relPath, hash), { credentials: 'same-origin' })
  if (!response.ok) throw new Error(`Could not load result file (${response.status})`)
  return response.text()
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (STATIC_DEMO) return (await staticRequest(method, path)) as T
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.')
  }
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try { message = ((await response.json()) as { error?: string }).error ?? message } catch { /* non-JSON error */ }
    throw new ApiError(response.status, message)
  }
  return (await response.json()) as T
}

const t = (id: string) => `/tutorials/${encodeURIComponent(id)}`
const r = (id: string, runId: string) => `${t(id)}/runs/${encodeURIComponent(runId)}`

export const api = {
  session: () => request<SessionInfo>('GET', '/session'),
  join: (input: { mode: 'new' | 'returning'; name: string; pin: string; code?: string }) =>
    request<{ student: { id: string; name: string } }>('POST', '/session/join', input),
  logout: () => request<{ ok: boolean }>('POST', '/session/logout'),
  status: () => request<{ compute: { online: boolean; running: number; queued: number; slots: number }; mine: JobView[] }>('GET', '/status'),
  tutorials: () => request<{ tutorials: TutorialSummary[] }>('GET', '/tutorials'),
  tutorial: (id: string) => request<{ tutorial: TutorialDef; guide: string; workspace: WorkspaceView }>('GET', t(id)),
  workspace: (id: string) => request<WorkspaceView>('GET', `${t(id)}/workspace`),
  setValues: (id: string, values: Record<string, Value>) => request<WorkspaceView>('PUT', `${t(id)}/workspace`, { values }),
  resetWorkspace: (id: string) => request<WorkspaceView>('POST', `${t(id)}/workspace/reset`),
  files: (id: string) => request<{ files: CaseFile[] }>('GET', `${t(id)}/files`),
  saveFile: (id: string, path: string, content: string) => request<WorkspaceView>('PUT', `${t(id)}/files`, { path, content }),
  revertFile: (id: string, path: string) => request<WorkspaceView>('DELETE', `${t(id)}/files?path=${encodeURIComponent(path)}`),
  createRun: (id: string) => request<{ runId: string; workspace: WorkspaceView }>('POST', `${t(id)}/runs`),
  deleteRun: (id: string, runId: string) => request<WorkspaceView>('DELETE', r(id, runId)),
  cancelRun: (id: string, runId: string) => request<WorkspaceView>('POST', `${r(id, runId)}/cancel`),
  log: (id: string, runId: string, query: string) => request<LogChunk>('GET', `${r(id, runId)}/log?${query}`),
  convergence: (id: string, runId: string) => request<Convergence>('GET', `${r(id, runId)}/convergence`),
  runFiles: (id: string, runId: string) => request<{ files: CaseFile[] }>('GET', `${r(id, runId)}/files`),
  manifest: (id: string, runId: string) => request<VtkManifest>('GET', `${r(id, runId)}/vtk/manifest`),
  vtkRanges: (id: string, runId: string) => request<{ ranges: FieldRangeTable }>('GET', `${r(id, runId)}/vtk/ranges`),
  vtkUrl: (id: string, runId: string, relPath: string, hash: string) =>
    `/api${r(id, runId)}/vtk/file?path=${encodeURIComponent(relPath)}&h=${hash.slice(0, 10)}`,
  logDownloadUrl: (id: string, runId: string) => `/api${r(id, runId)}/log.txt`,
  thumbnailUrl: (id: string) => (STATIC_DEMO ? `data/${id}/thumbnail.jpg` : `/api${t(id)}/thumbnail`),
  adminLogin: (code: string) => request<{ ok: boolean }>('POST', '/admin/login', { code }),
  adminOverview: () => request<AdminOverview>('GET', '/admin/overview'),
  adminRebake: (force: boolean, tutorials?: string[]) => request<{ ok: boolean }>('POST', '/admin/rebake', { force, ...(tutorials ? { tutorials } : {}) }),
  adminResetPin: (studentId: string, pin: string) => request<{ ok: boolean }>('POST', `/admin/students/${studentId}/reset-pin`, { pin }),
  adminRemoveStudent: (studentId: string) => request<{ ok: boolean }>('DELETE', `/admin/students/${studentId}`),
}

export function isActive(status: RunStatus): boolean {
  return status === 'queued' || status === 'running'
}
