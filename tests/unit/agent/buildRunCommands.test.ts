/**
 * Unit tests for buildRunCommands — the run pipeline command list.
 *
 * Regression focus: a VoF case (dam break) carries system/setFieldsDict to
 * initialise the water column. Without a setFields step the solver runs on
 * uniform alpha.water = 0 (no water at all), so foamRun "succeeds" but the
 * dam break is empty. setFields must run after blockMesh and before foamRun,
 * and only when setFieldsDict is present.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { buildRunCommands } from '../../../core/run/buildRunCommands.js'

let caseDir: string

beforeEach(() => {
  caseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ofs-runcmds-'))
  fs.mkdirSync(path.join(caseDir, 'system'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(caseDir, { recursive: true, force: true })
})

const names = (caseDir: string) => buildRunCommands(caseDir).map((c) => c.cmd)

describe('buildRunCommands', () => {
  it('omits setFields when no setFieldsDict is present', () => {
    expect(names(caseDir)).not.toContain('setFields')
  })

  it('includes setFields when system/setFieldsDict exists', () => {
    fs.writeFileSync(path.join(caseDir, 'system/setFieldsDict'), 'regions ();\n')
    expect(names(caseDir)).toContain('setFields')
  })

  it('runs setFields after blockMesh and before foamRun', () => {
    fs.writeFileSync(path.join(caseDir, 'system/setFieldsDict'), 'regions ();\n')
    const order = names(caseDir)
    const iBlock = order.indexOf('blockMesh')
    const iSet = order.indexOf('setFields')
    const iRun = order.indexOf('foamRun')
    expect(iBlock).toBeLessThan(iSet)
    expect(iSet).toBeLessThan(iRun)
  })

  it('always starts with blockMesh and ends solving with foamRun', () => {
    const order = names(caseDir)
    expect(order[0]).toBe('blockMesh')
    expect(order).toContain('foamRun')
    expect(order).toContain('foamToVTK')
  })
})
