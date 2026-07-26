/**
 * App-root resolution that survives bundling.
 *
 * In dev, every module runs from its source location, so a fixed number of '..'
 * hops from `import.meta.url` lands on the repo root. In the packaged app
 * scripts/compile-server.mjs inlines all of core/** into
 * demo/server.compiled.js, so those same hops resolve relative to <app>/demo
 * and land *outside* the app bundle — wiki/ and docs/ lookups then silently
 * return nothing.
 *
 * Walking up to the nearest directory that holds a package.json is correct in
 * both layouts: core/agent/ → repo root in dev, <app>/demo → <app> when
 * packaged (electron-builder always ships package.json at the app root).
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Nearest ancestor of `startDir` (inclusive) containing a package.json.
 *
 * Falls back to `startDir` when there is none, so callers still get an absolute
 * path and their own existsSync guards decide what to do about missing content.
 * `OFS_APP_ROOT` overrides the search when it points at a real directory.
 */
export function resolveAppRoot(startDir: string): string {
  const override = process.env['OFS_APP_ROOT']
  if (override && fs.existsSync(override)) return override

  let dir = path.resolve(startDir)
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return path.resolve(startDir) // hit the filesystem root
    dir = parent
  }
}
