/**
 * Solve the reference case of every tutorial once and store the results.
 *
 *   npm run classroom:bake                 solve whatever is missing
 *   npm run classroom:bake -- --force      re-solve everything
 *   npm run classroom:bake -- cavity       only the named tutorials
 *
 * The server does the same thing in the background on startup (OFS_AUTO_BAKE);
 * this command is for preparing a machine ahead of a class and for checking
 * that every tutorial still solves after an OpenFOAM image update.
 */
import path from 'node:path'
import Docker from 'dockerode'
import { cleanupOwnedContainers, ensureOpenFoamImage, OPENFOAM_IMAGE } from '../../core/docker/CommandRunner.js'
import { loadConfig } from './config.js'
import { BAKE, RunQueue } from './queue.js'
import { ResultStore } from './results.js'
import { loadCatalog, renderCase, resolveParams } from './tutorials.js'

const args = process.argv.slice(2)
const force = args.includes('--force')
const only = args.filter(arg => !arg.startsWith('--'))

const config = loadConfig()
const catalog = loadCatalog(config.tutorialsDir)
const docker = new Docker()
const store = new ResultStore(config.dataDir)
const queue = new RunQueue(docker, store, path.join(config.dataDir, 'work'), config.maxConcurrentRuns)

for (const id of only) if (!catalog.has(id)) { console.error(`Unknown tutorial: ${id}`); process.exit(2) }

console.log(`Image: ${OPENFOAM_IMAGE}`)
await ensureOpenFoamImage(docker, { onProgress: message => process.stdout.write(`\r${message.padEnd(80).slice(0, 80)}`) })

process.on('SIGINT', () => { queue.abortAll(); void cleanupOwnedContainers().finally(() => process.exit(130)) })

let failures = 0
await Promise.all([...catalog.values()].filter(t => !only.length || only.includes(t.def.id)).map(async tutorial => {
  const rendered = renderCase(tutorial, resolveParams(tutorial))
  if (force) store.remove(rendered.hash)
  const cached = store.read(rendered.hash)
  if (cached) { console.log(`✓ ${tutorial.def.id.padEnd(16)} already solved (${cached.status})`); return }
  const started = Date.now()
  queue.submit(tutorial, rendered, BAKE)
  const result = await queue.wait(rendered.hash)
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  if (result?.status === 'succeeded') {
    console.log(`✓ ${tutorial.def.id.padEnd(16)} solved in ${seconds} s — ${result.cells ?? '?'} cells, final time ${result.finalTime}, ${(result.vtkBytes / 1e6).toFixed(1)} MB of results`)
  } else {
    failures++
    console.error(`✗ ${tutorial.def.id.padEnd(16)} ${result ? `failed at ${result.failedStage}: ${result.reason}` : queue.outcome(rendered.hash)?.message ?? 'did not finish'}`)
    console.error(`  log: ${result ? store.logPath(rendered.hash) : '(not stored)'}`)
  }
}))

await cleanupOwnedContainers()
process.exit(failures ? 1 : 0)
