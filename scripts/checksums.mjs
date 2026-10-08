import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'

const directory = path.join(process.cwd(), 'dist', 'releases')
const platform = process.platform === 'darwin' ? 'mac' : 'windows'
const files = fs.readdirSync(directory).filter(file => /\.(dmg|exe)$/.test(file)).sort()
if (!files.length) throw new Error('No installers to checksum')
const lines = files.map(file => `${createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex')}  ${file}`)
fs.writeFileSync(path.join(directory, `SHA256SUMS-${platform}.txt`), `${lines.join('\n')}\n`)
