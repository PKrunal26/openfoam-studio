import { describe, it, expect } from 'vitest'
import { classifyVtkFile, buildVtkSeries } from '../../../core/postprocess/vtkSeries'

describe('classifyVtkFile — OpenFOAM Foundation legacy layout', () => {
  it('internal mesh at integer and fractional times', () => {
    expect(classifyVtkFile('cavity_0.vtk')).toEqual({ kind: 'internalMesh', time: 0, patchName: null })
    expect(classifyVtkFile('cavity_0.5.vtk')).toEqual({ kind: 'internalMesh', time: 0.5, patchName: null })
    expect(classifyVtkFile('cavity_10.vtk')).toEqual({ kind: 'internalMesh', time: 10, patchName: null })
  })

  it('patch files under a per-patch subdirectory', () => {
    expect(classifyVtkFile('movingWall/movingWall_0.5.vtk')).toEqual({
      kind: 'patch', time: 0.5, patchName: 'movingWall',
    })
    expect(classifyVtkFile('fixedWalls/fixedWalls_10.vtk')).toEqual({
      kind: 'patch', time: 10, patchName: 'fixedWalls',
    })
  })

  it('scientific-notation time suffix', () => {
    expect(classifyVtkFile('cavity_1e-05.vtk')).toEqual({ kind: 'internalMesh', time: 1e-5, patchName: null })
  })

  it('time-index naming (no -useTimeName) still parses as a number', () => {
    expect(classifyVtkFile('cavity_100.vtk')!.time).toBe(100)
  })

  it('files without a numeric suffix get time null', () => {
    expect(classifyVtkFile('notes.vtk')).toEqual({ kind: 'internalMesh', time: null, patchName: null })
  })
})

describe('classifyVtkFile — XML layout (ESI / newer exporters)', () => {
  it('multiblock index, internal cells, and boundary patches', () => {
    expect(classifyVtkFile('cavity_2.vtm')).toEqual({ kind: 'multiblock', time: 2, patchName: null })
    expect(classifyVtkFile('cavity_2/internal.vtu')).toEqual({ kind: 'internalMesh', time: 2, patchName: null })
    expect(classifyVtkFile('cavity_2/boundary/movingWall.vtp')).toEqual({
      kind: 'patch', time: 2, patchName: 'movingWall',
    })
  })
})

describe('buildVtkSeries', () => {
  it('groups files into time steps sorted ascending', () => {
    const series = buildVtkSeries([
      'cavity_1.vtk',
      'cavity_0.5.vtk',
      'cavity_0.vtk',
      'movingWall/movingWall_0.vtk',
      'movingWall/movingWall_0.5.vtk',
      'movingWall/movingWall_1.vtk',
      'fixedWalls/fixedWalls_1.vtk',
    ])
    expect(series.times).toEqual([0, 0.5, 1])
    expect(series.steps).toHaveLength(3)
    const last = series.steps[2]!
    expect(last.time).toBe(1)
    expect(last.internal).toBe('cavity_1.vtk')
    expect(last.patches).toEqual({
      movingWall: 'movingWall/movingWall_1.vtk',
      fixedWalls: 'fixedWalls/fixedWalls_1.vtk',
    })
  })

  it('ignores non-series files and multiblock indexes', () => {
    const series = buildVtkSeries(['cavity_0.vtk', 'cavity_0.vtm', 'readme.txt'])
    expect(series.times).toEqual([0])
    expect(series.steps[0]!.internal).toBe('cavity_0.vtk')
  })

  it('empty input → empty series', () => {
    expect(buildVtkSeries([]).times).toEqual([])
  })
})
