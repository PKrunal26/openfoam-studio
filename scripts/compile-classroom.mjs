// Bundle classroom/server/server.ts (+ core/**) → classroom/dist/server.js and
// the bake CLI → classroom/dist/bake.js. node_modules stay external.
import { build } from 'esbuild'

for (const entry of ['server', 'bake']) {
  await build({
    entryPoints: [`classroom/server/${entry}.ts`],
    platform: 'node',
    format: 'esm',
    bundle: true,
    packages: 'external',
    outfile: `classroom/dist/${entry}.js`,
    sourcemap: false,
  })
}
console.log('classroom server bundled → classroom/dist/{server,bake}.js')
