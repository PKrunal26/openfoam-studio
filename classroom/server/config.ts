/**
 * Classroom server configuration. Everything is environment-driven so the same
 * build runs on a laptop, a lab machine or an AWS instance.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveAppRoot } from '../../core/paths.js'

const here = path.dirname(fileURLToPath(import.meta.url))
export const APP_ROOT = resolveAppRoot(here)

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number`)
  return Math.min(max, Math.max(min, Math.round(value)))
}

export interface ClassroomConfig {
  port: number
  host: string
  /** Absolute. Must be the same path on the Docker host when the server runs in a container. */
  dataDir: string
  tutorialsDir: string
  webDir: string
  className: string
  /** Students need this to create an account. Empty string = open enrolment (local demos only). */
  classCode: string
  /** Unlocks the instructor overview. Empty string disables it. */
  instructorCode: string
  maxConcurrentRuns: number
  /** Runs a student may keep per tutorial (the reference run is not counted). */
  maxRunsPerTutorial: number
  maxRunsPerDay: number
  /** Result cache budget; unreferenced entries are evicted oldest-first above this. */
  cacheMaxBytes: number
  /** Set when served over plain HTTP on a trusted network so cookies are not marked Secure. */
  secureCookies: boolean
  /** Solve missing reference results on startup. */
  autoBake: boolean
}

export function loadConfig(): ClassroomConfig {
  const dataDir = path.resolve(process.env['OFS_CLASSROOM_DATA'] ?? path.join(APP_ROOT, 'classroom', 'data'))
  return {
    port: intEnv('OFS_CLASSROOM_PORT', 8080, 1, 65535),
    host: process.env['OFS_CLASSROOM_HOST'] ?? '0.0.0.0',
    dataDir,
    tutorialsDir: path.resolve(process.env['OFS_CLASSROOM_TUTORIALS'] ?? path.join(APP_ROOT, 'classroom', 'tutorials')),
    webDir: path.resolve(process.env['OFS_CLASSROOM_WEB'] ?? path.join(APP_ROOT, 'classroom', 'web', 'dist')),
    className: process.env['OFS_CLASS_NAME'] ?? 'CFD with OpenFOAM',
    classCode: process.env['OFS_CLASS_CODE'] ?? '',
    instructorCode: process.env['OFS_INSTRUCTOR_CODE'] ?? '',
    maxConcurrentRuns: intEnv('OFS_MAX_CONCURRENT_RUNS', 2, 1, 32),
    maxRunsPerTutorial: intEnv('OFS_MAX_RUNS_PER_TUTORIAL', 8, 1, 50),
    maxRunsPerDay: intEnv('OFS_MAX_RUNS_PER_DAY', 40, 1, 1000),
    cacheMaxBytes: intEnv('OFS_CACHE_MAX_GB', 20, 1, 2000) * 1024 ** 3,
    secureCookies: (process.env['OFS_SECURE_COOKIES'] ?? '0') === '1',
    autoBake: (process.env['OFS_AUTO_BAKE'] ?? '1') !== '0',
  }
}
