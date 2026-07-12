// Runs after electron-builder finishes (mac or win).
// Moves distributable installers (.dmg, .exe) to dist/releases/
// and removes intermediate unpacked folders and auto-updater metadata.
import fs from 'fs'
import path from 'path'

const dist     = 'dist'
const releases = path.join(dist, 'releases')
const KEEP_EXT = new Set(['.dmg', '.exe', '.zip', '.AppImage'])

fs.mkdirSync(releases, { recursive: true })

for (const name of fs.readdirSync(dist)) {
  if (name === 'releases') continue
  const full = path.join(dist, name)
  const stat = fs.statSync(full)

  if (stat.isDirectory()) {
    fs.rmSync(full, { recursive: true, force: true })
    console.log(`removed  ${name}/`)
    continue
  }

  const ext = path.extname(name).toLowerCase()
  if (KEEP_EXT.has(ext)) {
    fs.renameSync(full, path.join(releases, name))
    console.log(`moved    ${name}  →  releases/`)
  } else {
    // .blockmap, .yml, builder-debug.yml — only useful for auto-updater infra
    fs.rmSync(full, { force: true })
    console.log(`removed  ${name}`)
  }
}

console.log('\ndist/releases/:')
for (const name of fs.readdirSync(releases)) {
  const size = (fs.statSync(path.join(releases, name)).size / 1_048_576).toFixed(0)
  console.log(`  ${name}  (${size} MB)`)
}
