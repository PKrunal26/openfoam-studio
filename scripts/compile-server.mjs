// Bundle demo/server.ts + all local core/** modules → demo/server.compiled.js
// node_modules (dockerode, @anthropic-ai/sdk, …) stay external and are resolved
// at runtime from the packaged app's node_modules.
// Bundling local files eliminates ERR_MODULE_NOT_FOUND on Windows where the
// packaged app ships .ts sources (not .js) and the .js import paths don't resolve.
import { build } from 'esbuild'

await build({
  entryPoints: ['demo/server.ts'],
  platform: 'node',
  format: 'esm',
  bundle: true,           // inline core/** into this file
  packages: 'external',  // keep all node_modules as runtime externals
  outfile: 'demo/server.compiled.js',
  sourcemap: false,
})

console.log('server.ts + core/** bundled → demo/server.compiled.js')
