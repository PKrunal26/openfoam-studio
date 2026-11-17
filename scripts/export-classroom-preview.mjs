// Export the read-only classroom preview data from a running classroom server.
//
//   node scripts/export-classroom-preview.mjs <outDir> [serverUrl]
//
// Waits until every reference case is solved, then writes the JSON, result
// files and thumbnails that the static build (VITE_STATIC_DEMO=1) reads from
// "data/" next to index.html. Class code comes from OFS_CLASS_CODE if set.
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const outDir = process.argv[2]
const base = `${(process.argv[3] ?? 'http://127.0.0.1:8080').replace(/\/$/, '')}/api`
if (!outDir) {
  console.error('usage: node scripts/export-classroom-preview.mjs <outDir> [serverUrl]')
  process.exit(1)
}
const dataDir = path.join(outDir, 'data')
const MAX_STEPS = 24
const WAIT_MINUTES = 20

let cookie = ''
async function raw(route, init = {}) {
  const response = await fetch(`${base}${route}`, { ...init, headers: { ...(init.headers ?? {}), ...(cookie ? { Cookie: cookie } : {}) } })
  const set = response.headers.getSetCookie?.() ?? []
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ')
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${route} failed (${response.status}): ${await response.text()}`)
  return response
}
const get = async (route) => (await raw(route)).json()
const post = async (route, body) =>
  (await raw(route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })).json()

async function save(rel, content) {
  const file = path.join(dataDir, rel)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, typeof content === 'string' || content instanceof Uint8Array ? content : JSON.stringify(content))
}

await post('/session/join', {
  mode: 'new',
  name: `Preview Export ${Date.now().toString(36)}`,
  pin: Math.random().toString(36).slice(2, 12),
  code: process.env.OFS_CLASS_CODE ?? '',
})

// Wait for the reference solutions (the server solves missing ones on startup).
const deadline = Date.now() + WAIT_MINUTES * 60_000
let catalog
for (;;) {
  catalog = await get('/tutorials')
  const states = catalog.tutorials.map((t) => t.reference.status)
  if (states.every((s) => s === 'succeeded')) break
  const broken = catalog.tutorials.filter((t) => !['succeeded', 'queued', 'running', 'missing'].includes(t.reference.status))
  if (broken.length) throw new Error(`Reference case did not solve: ${broken.map((t) => `${t.id} (${t.reference.status})`).join(', ')}`)
  if (Date.now() > deadline) throw new Error(`Reference cases not ready after ${WAIT_MINUTES} minutes: ${states.join(', ')}`)
  await new Promise((resolve) => setTimeout(resolve, 5000))
}

for (const t of catalog.tutorials) t.mine = null
await save('tutorials.json', catalog)

for (const { id } of catalog.tutorials) {
  const t = `/tutorials/${encodeURIComponent(id)}`
  const detail = await get(t)
  detail.workspace.runs = detail.workspace.runs.filter((run) => run.isReference)
  await save(path.join(id, 'tutorial.json'), detail)
  await save(path.join(id, 'files.json'), await get(`${t}/runs/reference/files`))
  await save(path.join(id, 'log.json'), await get(`${t}/runs/reference/log?tail=1500`))
  await save(path.join(id, 'convergence.json'), await get(`${t}/runs/reference/convergence`))

  // Keep the last time steps only, and patch surfaces for the first kept step.
  const manifest = await get(`${t}/runs/reference/vtk/manifest`)
  const steps = manifest.series.steps.slice(-MAX_STEPS)
  const keep = []
  steps.forEach((step, index) => {
    if (index > 0) step.patches = {}
    if (step.internal) keep.push(step.internal)
    keep.push(...Object.values(step.patches))
  })
  manifest.series = { times: steps.map((step) => step.time), steps }
  manifest.files = manifest.files.filter((file) => keep.includes(file.relPath))
  await save(path.join(id, 'manifest.json'), manifest)
  for (const rel of keep) {
    const response = await raw(`${t}/runs/reference/vtk/file?path=${encodeURIComponent(rel)}`)
    await save(path.join(id, 'vtk', `${rel.replace(/\//g, '__')}.txt`), new Uint8Array(await response.arrayBuffer()))
  }
  await save(path.join(id, 'thumbnail.jpg'), new Uint8Array(await (await raw(`${t}/thumbnail`)).arrayBuffer()))
  console.log(`exported ${id}: ${steps.length} time steps, ${keep.length} result files`)
}
console.log(`preview data written to ${dataDir}`)
