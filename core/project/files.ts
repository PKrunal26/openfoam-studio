import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

export function normalizeLF(content: string): string { return content.replace(/\r\n?/g, '\n') }

export function atomicWrite(file: string, content: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`)
  try {
    const descriptor = fs.openSync(temporary, 'wx', 0o600)
    try { fs.writeFileSync(descriptor, content); fs.fsyncSync(descriptor) } finally { fs.closeSync(descriptor) }
    fs.renameSync(temporary, file)
  } finally {
    fs.rmSync(temporary, { force: true })
  }
}

/** Never follow project-controlled symlinks when reading, exporting or copying. */
export function projectFiles(dir: string, base = dir): { path: string; relPath: string }[] {
  if (!fs.existsSync(dir)) return []
  if (fs.lstatSync(dir).isSymbolicLink()) throw new Error('Symbolic links are not supported in project data')
  const result: { path: string; relPath: string }[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Symbolic link is not allowed: ${entry.name}`)
    if (entry.isDirectory()) result.push(...projectFiles(full, base))
    else if (entry.isFile()) result.push({ path: full, relPath: path.relative(base, full).split(path.sep).join('/') })
  }
  return result.sort((a, b) => a.relPath.localeCompare(b.relPath))
}

export function inputFiles(dir: string) {
  return projectFiles(dir).filter(({ relPath }) => /^(?:0|constant|system)\//.test(relPath) && !relPath.startsWith('constant/polyMesh/'))
}

export function caseRevision(dir: string): string {
  const hash = createHash('sha256')
  for (const file of inputFiles(dir)) hash.update(file.relPath).update('\0').update(fs.readFileSync(file.path)).update('\0')
  return hash.digest('hex')
}

export function copyCase(source: string, destination: string, inputsOnly = false): void {
  fs.mkdirSync(destination, { recursive: true })
  for (const file of inputsOnly ? inputFiles(source) : projectFiles(source)) {
    const target = path.join(destination, file.relPath)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(file.path, target)
  }
}

export function inputChanges(before: string, after: string): string[] {
  const existing = new Map(inputFiles(before).map(file => [file.relPath, fs.readFileSync(file.path)]))
  const changed: string[] = []
  for (const file of inputFiles(after)) {
    if (!existing.get(file.relPath)?.equals(fs.readFileSync(file.path))) changed.push(file.relPath)
  }
  return changed
}

/** Commit a whole input revision by directory rename, retaining a recoverable old case. */
export function commitCaseInputs(current: string, staged: string, backup: string): void {
  const replacement = path.join(path.dirname(current), `.case-${randomUUID()}`)
  try {
    copyCase(current, replacement)
    for (const file of inputFiles(staged)) atomicWrite(path.join(replacement, file.relPath), normalizeLF(fs.readFileSync(file.path, 'utf8')))
    fs.mkdirSync(path.dirname(backup), { recursive: true })
    const hadCase = fs.existsSync(current)
    if (hadCase) fs.renameSync(current, backup)
    try { fs.renameSync(replacement, current) } catch (error) {
      if (hadCase) fs.renameSync(backup, current)
      throw error
    }
  } finally { fs.rmSync(replacement, { recursive: true, force: true }) }
}

export function checkedFile(root: string, relative: string): string {
  if (!relative || path.isAbsolute(relative) || relative.includes('\0')) throw new Error('Invalid relative file path')
  const result = path.resolve(root, relative)
  const rel = path.relative(root, result)
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error('File path is outside the case')
  let current = root
  if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Symbolic links are not allowed')
  for (const part of rel.split(path.sep)) {
    current = path.join(current, part)
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Symbolic links are not allowed')
  }
  return result
}
