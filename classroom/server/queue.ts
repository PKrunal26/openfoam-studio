/**
 * Compute queue. The whole class shares a small, fixed number of solver slots.
 *
 * - Identical cases are solved once: a submission whose hash is already stored
 *   returns immediately, and one whose hash is already queued joins that job.
 * - Students wait in FIFO order; reference ("bake") jobs go to the back of the
 *   line so a restart never starves live users.
 * - A job is cancelled only when every student who asked for it has left.
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type Docker from 'dockerode'
import { PipelineInterrupted, runPipeline, type RunResult, type StageName } from './pipeline.js'
import type { ResultStore } from './results.js'
import type { RenderedCase, Tutorial } from './tutorials.js'

export const BAKE = '__reference__'

interface Job {
  id: string
  hash: string
  tutorial: Tutorial
  rendered: RenderedCase
  state: 'queued' | 'running'
  stage: StageName | null
  progress: number
  lines: string[]
  queuedAt: number
  startedAt: number | null
  requesters: Set<string>
  controller: AbortController
}

export interface JobView {
  id: string
  hash: string
  tutorialId: string
  state: 'queued' | 'running'
  stage: StageName | null
  progress: number
  /** 1-based place in line while queued, 0 when running */
  position: number
  queuedAt: number
  startedAt: number | null
}

export interface Outcome { kind: 'cancelled' | 'error'; message: string; at: number; logTail: string[] }

const MAX_LIVE_LINES = 20_000

export class RunQueue {
  private jobs = new Map<string, Job>()
  private order: string[] = []
  private running = 0
  private outcomes = new Map<string, Outcome>()
  private waiters = new Map<string, ((result: RunResult | null) => void)[]>()
  /** Set false when Docker is unreachable; submissions are refused with a clear message. */
  computeOnline = true

  constructor(
    private readonly docker: Docker,
    private readonly store: ResultStore,
    private readonly workRoot: string,
    private readonly maxConcurrent: number,
    private readonly onFinished?: (hash: string) => void,
  ) {
    fs.rmSync(workRoot, { recursive: true, force: true })
    fs.mkdirSync(workRoot, { recursive: true })
  }

  /** Queue a case unless its result already exists. */
  submit(tutorial: Tutorial, rendered: RenderedCase, requester: string): { result?: RunResult; job?: JobView } {
    const existing = this.store.read(rendered.hash)
    if (existing) { this.store.touch(rendered.hash); return { result: existing } }
    let job = this.jobs.get(rendered.hash)
    if (!job) {
      job = {
        id: randomUUID().slice(0, 12), hash: rendered.hash, tutorial, rendered, state: 'queued', stage: null,
        progress: 0, lines: [], queuedAt: Date.now(), startedAt: null, requesters: new Set(), controller: new AbortController(),
      }
      this.jobs.set(job.hash, job)
      this.order.push(job.hash)
      this.outcomes.delete(job.hash)
    }
    job.requesters.add(requester)
    // A student joining a reference job promotes it ahead of other reference jobs.
    if (requester !== BAKE) this.promote(job.hash)
    queueMicrotask(() => this.pump())
    return { job: this.view(job) }
  }

  private promote(hash: string): void {
    const index = this.order.indexOf(hash)
    if (index < 0) return
    const firstBake = this.order.findIndex(h => {
      const job = this.jobs.get(h)
      return job?.state === 'queued' && job.requesters.size === 1 && job.requesters.has(BAKE)
    })
    if (firstBake >= 0 && firstBake < index) {
      this.order.splice(index, 1)
      this.order.splice(firstBake, 0, hash)
    }
  }

  /** Resolves when the hash has a stored result, or null if its job ended without one. */
  wait(hash: string): Promise<RunResult | null> {
    const stored = this.store.read(hash)
    if (stored) return Promise.resolve(stored)
    if (!this.jobs.has(hash)) return Promise.resolve(null)
    return new Promise(resolve => {
      const list = this.waiters.get(hash) ?? []
      list.push(resolve)
      this.waiters.set(hash, list)
    })
  }

  private pump(): void {
    while (this.running < this.maxConcurrent) {
      const next = this.order.find(hash => this.jobs.get(hash)?.state === 'queued')
      if (!next) return
      const job = this.jobs.get(next)!
      job.state = 'running'
      job.startedAt = Date.now()
      this.running++
      void this.execute(job)
    }
  }

  private async execute(job: Job): Promise<void> {
    const staging = this.store.stagingDir(job.id)
    let result: RunResult | null = null
    try {
      result = await runPipeline({
        docker: this.docker, tutorial: job.tutorial, rendered: job.rendered, jobId: job.id,
        workDir: path.join(this.workRoot, job.id), resultDir: staging, signal: job.controller.signal,
        hooks: {
          onLine: line => { if (job.lines.length < MAX_LIVE_LINES) job.lines.push(line) },
          onStage: stage => { job.stage = stage; if (stage !== 'solve') job.progress = stage === 'export' ? 1 : 0 },
          onProgress: fraction => { job.progress = fraction },
        },
      })
      this.store.commit(staging, result)
    } catch (error) {
      const interrupted = error instanceof PipelineInterrupted ? error : new PipelineInterrupted('error', (error as Error).message)
      this.outcomes.set(job.hash, {
        kind: interrupted.kind,
        message: interrupted.kind === 'cancelled' ? 'This run was cancelled.' : `The compute backend failed: ${interrupted.message}`,
        at: Date.now(), logTail: job.lines.slice(-200),
      })
      fs.rmSync(staging, { recursive: true, force: true })
      // eslint-disable-next-line no-console
      if (interrupted.kind === 'error') console.error(`[queue] job ${job.id} (${job.tutorial.def.id}) failed: ${interrupted.message}`)
    } finally {
      this.jobs.delete(job.hash)
      this.order = this.order.filter(hash => hash !== job.hash)
      this.running--
      for (const resolve of this.waiters.get(job.hash) ?? []) resolve(result)
      this.waiters.delete(job.hash)
      this.onFinished?.(job.hash)
      this.pump()
    }
  }

  /** Withdraw one requester; the job stops when nobody is waiting for it. */
  cancel(hash: string, requester: string): boolean {
    const job = this.jobs.get(hash)
    if (!job || !job.requesters.delete(requester)) return false
    if (job.requesters.size > 0) return true
    if (job.state === 'queued') {
      this.jobs.delete(hash)
      this.order = this.order.filter(h => h !== hash)
      this.outcomes.set(hash, { kind: 'cancelled', message: 'This run was cancelled.', at: Date.now(), logTail: [] })
      for (const resolve of this.waiters.get(hash) ?? []) resolve(null)
      this.waiters.delete(hash)
    } else job.controller.abort()
    return true
  }

  /** Stop everything (server shutdown). */
  abortAll(): void {
    for (const job of this.jobs.values()) job.controller.abort()
  }

  private view(job: Job): JobView {
    const queued = this.order.filter(hash => this.jobs.get(hash)?.state === 'queued')
    return {
      id: job.id, hash: job.hash, tutorialId: job.tutorial.def.id, state: job.state, stage: job.stage,
      progress: job.progress, position: job.state === 'queued' ? queued.indexOf(job.hash) + 1 : 0,
      queuedAt: job.queuedAt, startedAt: job.startedAt,
    }
  }

  job(hash: string): JobView | null {
    const job = this.jobs.get(hash)
    return job ? this.view(job) : null
  }

  isRequester(hash: string, requester: string): boolean {
    return this.jobs.get(hash)?.requesters.has(requester) ?? false
  }

  activeFor(requester: string): JobView[] {
    return [...this.jobs.values()].filter(job => job.requesters.has(requester)).map(job => this.view(job))
  }

  liveLines(hash: string, from: number): { lines: string[]; next: number } | null {
    const job = this.jobs.get(hash)
    if (!job) return null
    const start = Math.max(0, Math.min(from, job.lines.length))
    const lines = job.lines.slice(start, start + 2000)
    return { lines, next: start + lines.length }
  }

  outcome(hash: string): Outcome | null { return this.outcomes.get(hash) ?? null }

  summary(): { running: number; queued: number; slots: number; online: boolean; jobs: (JobView & { requesters: string[] })[] } {
    const jobs = this.order.map(hash => this.jobs.get(hash)!).filter(Boolean)
    return {
      running: this.running, queued: jobs.filter(job => job.state === 'queued').length, slots: this.maxConcurrent,
      online: this.computeOnline,
      jobs: jobs.map(job => ({ ...this.view(job), requesters: [...job.requesters] })),
    }
  }
}
