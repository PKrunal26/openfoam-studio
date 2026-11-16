/**
 * Solve every dropdown option and every guide exercise of every tutorial.
 *
 *   npm run classroom:verify              all tutorials
 *   npm run classroom:verify -- cavity    only the named ones
 *
 * For tutorial authors and for checking a new OpenFOAM image: a setting that
 * students can pick in a form should never end in a broken case. Each tutorial
 * lists its exercise settings under "verify" in tutorial.json; entries marked
 * { "expect": "failed" } are exercises that are meant to diverge.
 * Results go to a throwaway directory, not the classroom data.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Docker from 'dockerode'
import { cleanupOwnedContainers, ensureOpenFoamImage } from '../../core/docker/CommandRunner.js'
import { loadConfig } from './config.js'
import { RunQueue } from './queue.js'
import { ResultStore } from './results.js'
import { loadCatalog, renderCase, resolveParams } from './tutorials.js'

const only = process.argv.slice(2).filter(arg => !arg.startsWith('--'))
const config = loadConfig()
const catalog = loadCatalog(config.tutorialsDir)
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ofs-classroom-verify-'))
const docker = new Docker()
const store = new ResultStore(dataDir)
const queue = new RunQueue(docker, store, path.join(dataDir, 'work'), config.maxConcurrentRuns)
await ensureOpenFoamImage(docker)
process.on('SIGINT', () => { queue.abortAll(); void cleanupOwnedContainers().finally(() => process.exit(130)) })

interface Check { label: string; line: Promise<{ ok: boolean; text: string }> }
const checks: Check[] = []

for (const tutorial of catalog.values()) {
  if (only.length && !only.includes(tutorial.def.id)) continue
  const sets: { values: Record<string, unknown>; expect: 'succeeded' | 'failed' }[] = [{ values: {}, expect: 'succeeded' }]
  for (const param of tutorial.def.params) {
    if (param.type !== 'select') continue
    for (const option of param.options!) {
      if (option.value === param.default) continue
      // An option the form already warns about is a deliberate "see what happens" choice.
      if (resolveParams(tutorial, { [param.id]: option.value }).issues.length) continue
      sets.push({ values: { [param.id]: option.value }, expect: 'succeeded' })
    }
  }
  for (const entry of tutorial.def.verify ?? []) sets.push({ values: entry.values, expect: entry.expect ?? 'succeeded' })

  for (const set of sets) {
    const label = `${tutorial.def.id.padEnd(14)} ${JSON.stringify(set.values)}`
    const resolved = resolveParams(tutorial, set.values)
    const blocking = resolved.issues.find(issue => issue.level === 'error')
    if (blocking) { checks.push({ label, line: Promise.resolve({ ok: false, text: `BLOCKED  ${label} :: ${blocking.message}` }) }); continue }
    const rendered = renderCase(tutorial, resolved)
    queue.submit(tutorial, rendered, 'verify')
    checks.push({
      label,
      line: queue.wait(rendered.hash).then(result => {
        if (!result) return { ok: false, text: `ERROR    ${label} :: ${queue.outcome(rendered.hash)?.message ?? 'did not finish'}` }
        const monitors = store.monitors(rendered.hash)
          .map(monitor => monitor.series.map(series => `${series.label}=${series.values[series.values.length - 1]?.toPrecision(4)}`).join(', ')).join(', ')
        const ok = result.status === set.expect
        const detail = `${(result.durationMs / 1000).toFixed(1)} s, ${result.cells} cells, t=${result.finalTime}${result.converged ? ', converged' : ''}${monitors ? `, ${monitors}` : ''}${result.reason ? ` :: ${result.reason}` : ''}`
        return { ok, text: `${ok ? (result.status === 'failed' ? 'OK(fail)' : 'OK      ') : 'WRONG   '} ${label} :: ${detail}` }
      }),
    })
  }
}

let bad = 0
for (const check of checks) {
  const { ok, text } = await check.line
  if (!ok) bad++
  console.log(text)
}
await cleanupOwnedContainers()
fs.rmSync(dataDir, { recursive: true, force: true })
console.log(bad ? `\n${bad} of ${checks.length} checks did not behave as expected.` : `\nAll ${checks.length} checks passed.`)
process.exit(bad ? 1 : 0)
