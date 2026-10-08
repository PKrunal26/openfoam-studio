import fs from 'node:fs'
import path from 'node:path'

/** All mutations are limited to solver inputs; no configuration, scripts or links. */
export function safeCasePath(caseDir: string, relative: string): string {
  if (typeof relative !== 'string' || !relative || relative.includes('\0') || path.isAbsolute(relative)) {
    throw new Error('Invalid case-relative file path')
  }
  const parts = relative.replace(/\\/g, '/').split('/')
  if (parts.some(part => !part || part === '.' || part === '..') ||
      !['0', 'constant', 'system'].includes(parts[0]!)) {
    throw new Error(`Invalid case-relative path; only input files under 0/, constant/, system/ are supported: ${relative}`)
  }
  const root = path.resolve(caseDir)
  if (fs.existsSync(root) && fs.lstatSync(root).isSymbolicLink()) throw new Error('Case root cannot be a symbolic link')
  let current = root
  for (const part of parts) {
    current = path.join(current, part)
    if (fs.existsSync(current) || (() => { try { fs.lstatSync(current); return true } catch { return false } })()) {
      const stat = fs.lstatSync(current)
      if (stat.isSymbolicLink()) throw new Error(`Symbolic links are not permitted: ${relative}`)
    }
  }
  return current
}

export function assertSafeDictionary(content: string, file = 'dictionary', maxBytes = 8 * 1024 * 1024): void {
  if (Buffer.byteLength(content) > maxBytes) throw new Error(`Input file exceeds the supported size limit: ${file}`)
  // Strip comments, but keep quoted paths and identifiers for policy inspection.
  const text = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  if (/#\s*(?:codeStream|calc|eval|code|includeEtc)\b|\b(?:coded\w*|systemCall|codeExecute|codeWrite|codeEnd|codeOptions|codeLibs)\b/i.test(text)) {
    throw new Error(`Executable dictionary constructs are disabled in the supported alpha: ${file}`)
  }
  // Keep dictionary execution within the reviewed OpenFOAM distribution. Arbitrary
  // dlopen paths (including generated libraries) are not supported.
  if (/#\s*(?!(?:include|includeIfPresent|remove|inputMode)\b)[A-Za-z]/.test(text)) {
    throw new Error(`Unreviewed dictionary directive in ${file}`)
  }
  const libs = /\blibs\s*\(([^)]*)\)/g
  for (const match of text.matchAll(libs)) {
    const entries = match[1]!.match(/"[^"]*"|[^\s]+/g) ?? []
    for (const entry of entries) {
      if (!/^(?:lib)?(?:fieldFunctionObjects|utilityFunctionObjects|forces|sampling)(?:\.so)?$/.test(entry.replace(/"/g, ''))) {
        throw new Error(`Unreviewed dynamic library in ${file}`)
      }
    }
  }
  // Includes are opt-in only inside the case. Reject environment substitution,
  // absolute/parent paths and the executable include directives above.
  for (const match of text.matchAll(/#\s*include(?:IfPresent)?\s+([^\s;]+)/g)) {
    const target = match[1]!.replace(/^"|"$/g, '')
    if (!target || /[$~\\]/.test(target) || path.isAbsolute(target) || target.split('/').includes('..')) {
      throw new Error(`External dictionary include is disabled: ${file}`)
    }
  }
}

export function assertCaseExecutionPolicy(caseDir: string): void {
  if (!fs.statSync(caseDir).isDirectory() || fs.lstatSync(caseDir).isSymbolicLink()) throw new Error('Invalid case directory')
  let count = 0
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (++count > 10_000) throw new Error('Case input exceeds the supported file limit')
      const full = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`Symbolic link in case inputs: ${entry.name}`)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) {
        const rel = path.relative(caseDir, full)
        // Known blockMesh data may exceed ordinary dictionary limits. Keep
        // executable-construct checks: headers/includes are still parsed by
        // OpenFOAM and cannot become a bypass through a mesh-shaped filename.
        const generatedMesh = path.relative(path.join(caseDir, 'constant', 'polyMesh'), full)
        const inMesh = ['points', 'faces', 'owner', 'neighbour', 'boundary', 'pointZones', 'faceZones', 'cellZones'].includes(generatedMesh)
        if (fs.statSync(full).size > (inMesh ? 128 : 8) * 1024 * 1024) throw new Error('Case input exceeds the supported size limit')
        assertSafeDictionary(fs.readFileSync(full, 'utf8'), rel, (inMesh ? 128 : 8) * 1024 * 1024)
      } else throw new Error('Special files are not permitted in case inputs')
    }
  }
  for (const name of ['0', 'constant', 'system']) {
    const directory = path.join(caseDir, name)
    if (fs.existsSync(directory)) {
      if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('Symbolic link in case inputs')
      walk(directory)
    }
  }
}
