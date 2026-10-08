import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore, isDirty } from '../../../renderer/store/useEditorStore'
import * as api from '../../../renderer/lib/api'

vi.mock('../../../renderer/lib/api', () => ({
  readFile: vi.fn(), writeFile: vi.fn(), FileConflictError: class FileConflictError extends Error {},
}))
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
beforeEach(() => { useEditorStore.getState().reset(); vi.clearAllMocks() })
describe('file buffer safety', () => {
  it('marks exactly the submitted text saved and keeps text typed during saving dirty', async () => {
    vi.mocked(api.readFile).mockResolvedValue('original')
    await useEditorStore.getState().openCaseFile('a', '0/U')
    useEditorStore.getState().updateContent('case:0/U', 'submitted')
    const write = deferred<void>()
    vi.mocked(api.writeFile).mockReturnValue(write.promise)
    const saving = useEditorStore.getState().saveTab('a', 'case:0/U')
    useEditorStore.getState().updateContent('case:0/U', 'new typing')
    write.resolve(); await saving
    expect(api.writeFile).toHaveBeenCalledWith('a', '0/U', 'submitted', 'original')
    expect(useEditorStore.getState().tabs[0]).toMatchObject({ content: 'new typing', savedContent: 'submitted' })
    expect(isDirty(useEditorStore.getState().tabs[0]!)).toBe(true)
  })
  it('preserves dirty buffers and reloads clean buffers after external edits', async () => {
    vi.mocked(api.readFile).mockResolvedValue('original')
    await useEditorStore.getState().openCaseFile('a', '0/U')
    await useEditorStore.getState().openCaseFile('a', '0/p')
    useEditorStore.getState().updateContent('case:0/U', 'my edits')
    vi.mocked(api.readFile).mockResolvedValue('AI refinement')
    await useEditorStore.getState().reloadFiles('a')
    expect(useEditorStore.getState().tabs[0]).toMatchObject({ content: 'my edits', savedContent: 'original', conflict: true })
    expect(useEditorStore.getState().tabs[1]).toMatchObject({ content: 'AI refinement', savedContent: 'AI refinement' })
  })
  it('requires a decision before closing a dirty file and cancel keeps it open', async () => {
    vi.mocked(api.readFile).mockResolvedValue('original')
    await useEditorStore.getState().openCaseFile('a', '0/U')
    useEditorStore.getState().updateContent('case:0/U', 'unsaved')
    useEditorStore.getState().closeTab('case:0/U')
    expect(useEditorStore.getState().pending?.ids).toEqual(['case:0/U'])
    await useEditorStore.getState().settlePending('cancel')
    expect(useEditorStore.getState().tabs).toHaveLength(1)
    useEditorStore.getState().closeTab('case:0/U')
    await useEditorStore.getState().settlePending('discard')
    expect(useEditorStore.getState().tabs).toHaveLength(0)
  })
  it('ignores a file read that finishes after switching project', async () => {
    const stale = deferred<string>()
    vi.mocked(api.readFile).mockReturnValueOnce(stale.promise).mockResolvedValueOnce('project B')
    const opening = useEditorStore.getState().openCaseFile('a', '0/U')
    useEditorStore.getState().reset()
    await useEditorStore.getState().openCaseFile('b', '0/U')
    stale.resolve('project A'); await opening
    expect(useEditorStore.getState().tabs[0]).toMatchObject({ projectId: 'b', content: 'project B' })
  })
  it('leaves a conflicted save dirty and actionable', async () => {
    vi.mocked(api.readFile).mockResolvedValue('old')
    await useEditorStore.getState().openCaseFile('a', '0/U')
    useEditorStore.getState().updateContent('case:0/U', 'edit')
    vi.mocked(api.writeFile).mockRejectedValue(new api.FileConflictError('Disk changed'))
    await expect(useEditorStore.getState().saveAll('a')).rejects.toThrow('Disk changed')
    expect(useEditorStore.getState().tabs[0]).toMatchObject({ content: 'edit', savedContent: 'old', conflict: true, saveError: 'Disk changed' })
  })
})
