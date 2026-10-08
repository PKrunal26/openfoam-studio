import { z } from 'zod'
import { HttpError } from './requests.js'

export const ARCHIVE_BODY_LIMIT = 192 * 1024 * 1024
export const ARCHIVE_DATA_LIMIT = 128 * 1024 * 1024
const identifier = z.string().regex(/^[a-zA-Z0-9-]{1,64}$/)
const validation = z.object({
  meshChecked: z.boolean(), solverCompleted: z.boolean(), finiteFields: z.boolean(),
  benchmark: z.literal('not-run'), warnings: z.array(z.string().max(16000)).max(100),
}).strict()
const run = z.object({
  id: identifier, startedAt: z.string().datetime(), finishedAt: z.string().datetime().optional(),
  status: z.enum(['running', 'success', 'failed', 'aborted', 'exhausted', 'reference']),
  exits: z.array(z.object({ cmd: z.string().max(200), code: z.number().int() }).strict()).max(1000),
  errorMessage: z.string().max(16000).optional(), inputRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  image: z.string().max(1024).optional(), imageDigest: z.string().max(1024).optional(),
  provider: z.string().max(40).optional(), model: z.string().max(200).optional(), validation: validation.optional(),
}).strict()
const message = z.object({
  role: z.enum(['user', 'assistant']), content: z.string().max(1024 * 1024), timestamp: z.string().datetime(),
  filesChanged: z.array(z.string().max(512)).max(1000).optional(),
  agentSteps: z.array(z.object({ tool: z.string().max(200), summary: z.string().max(16000).optional(), ok: z.boolean(), durationMs: z.number().nonnegative().optional() }).strict()).max(1000).optional(),
}).strict()
const archiveSchema = z.object({
  format: z.literal('openfoam-studio-project'), version: z.literal(1),
  exportedAt: z.string().datetime(), applicationVersion: z.string().max(100),
  project: z.object({
    id: identifier, name: z.string().min(1).max(120), prompt: z.string().max(50000),
    status: z.enum(['idle', 'generating', 'running', 'ready', 'done', 'error', 'draft', 'needs-input', 'unvalidated', 'validation-failed', 'interrupted']),
    createdAt: z.string().datetime(), messages: z.array(message).max(10000), retryCount: z.number().int().min(0).max(3),
    latestRunId: identifier.optional(), revision: z.string().regex(/^[a-f0-9]{64}$/).optional(), example: z.boolean().optional(),
    validation: z.object({ ok: z.boolean(), note: z.string().max(16000), checkedAt: z.string().datetime() }).strict().optional(),
  }).strict(),
  runs: z.array(run).max(10000),
  commands: z.array(z.object({
    runId: identifier, ts: z.string().datetime(), cmd: z.string().max(200), args: z.array(z.string().max(4096)).max(100),
    status: z.enum(['success', 'failed', 'error']), exitCode: z.number().int().optional(), durationMs: z.number().nonnegative(), errorMessage: z.string().max(16000).optional(),
  }).strict()).max(100000),
  case: z.record(z.string(), z.string().max(8 * 1024 * 1024)),
  files: z.array(z.object({ path: z.string().min(1).max(1024), encoding: z.literal('base64'), content: z.string().max(ARCHIVE_BODY_LIMIT) }).strict()).max(20000),
}).strict()

/** Validate an exported project before writing any imported bytes. Never restore identity or active state. */
export function parseProjectArchive(payload: Record<string, unknown>) {
  const parsed = archiveSchema.safeParse(payload)
  if (!parsed.success) throw new HttpError(400, 'Invalid OpenFOAM Studio project archive')
  const archive = parsed.data
  const seen = new Set<string>()
  const runIds = new Set(archive.runs.map(record => record.id))
  if (runIds.size !== archive.runs.length) throw new HttpError(400, 'Duplicate archive run IDs')
  if (archive.project.latestRunId && !runIds.has(archive.project.latestRunId)) throw new HttpError(400, 'Archive latest run is missing')
  const files: { path: string; content: Buffer }[] = []
  let size = 0
  for (const file of archive.files) {
    if (file.path.includes('\\') || file.path.includes('\0') || file.path.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.') || /[:\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new HttpError(400, 'Invalid archive file path')
    if (seen.has(file.path)) throw new HttpError(400, 'Duplicate archive file path')
    seen.add(file.path)
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content)) throw new HttpError(400, 'Invalid archive base64 data')
    const content = Buffer.from(file.content, 'base64')
    size += content.length
    if (size > ARCHIVE_DATA_LIMIT) throw new HttpError(413, 'Archive exceeds the 128 MB decoded data limit')
    // Metadata is reconstructed from validated fields. Ignore the redundant disk copies.
    if (['meta.json', 'runs.jsonl', 'commands.jsonl'].includes(file.path)) continue
    if (!/^(?:case\/|runs\/[a-zA-Z0-9-]+\/(?:case\/|inputs\.json$)|runs\/[a-zA-Z0-9-]+\.log$|revisions\/[a-zA-Z0-9-]+\/case\/)/.test(file.path)) throw new HttpError(400, 'Unsupported archive file location')
    const runId = /^runs\/([a-zA-Z0-9-]+)(?:\/|\.log$)/.exec(file.path)?.[1]
    if (runId && !runIds.has(runId)) throw new HttpError(400, 'Archive file refers to an unknown run')
    files.push({ path: file.path, content })
  }
  if (archive.runs.some(record => !files.some(file => file.path.startsWith(`runs/${record.id}/case/`)))) throw new HttpError(400, 'Archived run inputs are missing')
  return { ...archive, files }
}
