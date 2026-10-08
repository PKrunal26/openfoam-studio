import fs from 'fs'
import path from 'path'
import assert from 'assert/strict'
import { createHash } from 'crypto'

const root = process.cwd()
const packagedRoot = process.argv[2] ? path.resolve(process.argv[2]) : root
const config = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const windows = JSON.parse(fs.readFileSync(path.join(root, 'electron-builder.win.json'), 'utf8'))
function verifyReviewedFile(relative) {
  const source = fs.readFileSync(path.join(root, relative))
  const included = fs.readFileSync(path.join(packagedRoot, relative))
  assert.equal(createHash('sha256').update(included).digest('hex'), createHash('sha256').update(source).digest('hex'), `Packaged file differs from reviewed build: ${relative}`)
}
function verifyReviewedTree(relative) {
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    if (entry.name === '.gitkeep') continue // Electron's default file exclusions omit repository placeholders.
    const child = path.join(relative, entry.name)
    if (entry.isDirectory()) verifyReviewedTree(child)
    else if (entry.isFile()) verifyReviewedFile(child)
  }
}
for (const packaging of [config.build, windows]) {
  assert(packaging.files.some(item => item.startsWith('!demo/projects/')), 'Local projects must be excluded')
  assert.equal(packaging.nsis.deleteAppDataOnUninstall, false, 'Uninstall must preserve user data')
}
for (const relative of ['demo/server.compiled.js', 'renderer/dist/index.html', 'wiki/openfoam-13-agent-guide.md']) {
  assert(fs.statSync(path.join(packagedRoot, relative)).isFile(), `Missing runtime asset: ${relative}`)
}
for (const relative of ['0/U', '0/p', 'constant/physicalProperties', 'constant/momentumTransport', 'system/controlDict', 'system/blockMeshDict', 'system/fvSchemes', 'system/fvSolution']) {
  for (const starter of ['cavity', 'solved-cavity']) {
  const file = path.join(packagedRoot, 'demo', 'starters', starter, relative)
  const contents = fs.readFileSync(file, 'utf8')
  if (packagedRoot !== root) {
    const original = fs.readFileSync(path.join(root, 'demo', 'starters', starter, relative))
    assert.equal(createHash('sha256').update(contents).digest('hex'), createHash('sha256').update(original).digest('hex'), 'Packaged starter must match reviewed source')
  }
  assert(contents.includes('FoamFile') && !contents.includes('\r'), `Invalid starter file: ${relative}`)
  }
}
const reference = JSON.parse(fs.readFileSync(path.join(packagedRoot, 'demo', 'starters', 'solved-cavity', 'reference.json'), 'utf8'))
assert.equal(reference.kind, 'reference-visualization')
assert.equal(reference.certification, 'not-run')
assert.equal(reference.assets.length, 3)
for (const asset of reference.assets) {
  assert(!asset.path.includes('..') && asset.path.startsWith('VTK/'))
  const contents = fs.readFileSync(path.join(packagedRoot, 'demo', 'starters', 'solved-cavity', asset.path))
  assert.equal(createHash('sha256').update(contents).digest('hex'), asset.sha256, 'Reference asset must match provenance')
}
if (packagedRoot !== root) {
  for (const file of ['demo/server.compiled.js', 'demo/electron-main.cjs']) verifyReviewedFile(file)
  for (const directory of ['core', path.join('renderer', 'dist'), path.join('demo', 'starters')]) verifyReviewedTree(directory)
  const includedConfig = JSON.parse(fs.readFileSync(path.join(packagedRoot, 'package.json'), 'utf8'))
  assert.equal(includedConfig.version, config.version, 'Packaged version differs from reviewed version')
  for (const directory of ['projects', '.generated-case']) assert(!fs.existsSync(path.join(packagedRoot, 'demo', directory)), 'Packaged app contains local cases')
}
console.log('Packaging configuration and required assets verified. Actual installer smoke tests remain required.')
