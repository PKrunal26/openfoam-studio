import { useEffect, useMemo, useState } from 'react'
import { Pencil, RotateCcw, Save } from 'lucide-react'
import { api, type CaseFile } from '@c/api'
import { useToasts, useWorkbench } from '@c/store'
import { Button, Notice, Spinner, Tag, cn } from '@c/ui/primitives'

const GROUPS: { dir: string; label: string }[] = [
  { dir: '0', label: 'Fields and boundary conditions' },
  { dir: 'constant', label: 'Physical properties' },
  { dir: 'system', label: 'Mesh, time and numerics' },
]

/** Light OpenFOAM dictionary highlighting: comments, keywords, numbers. */
function highlight(line: string) {
  const comment = line.indexOf('//')
  const code = comment >= 0 ? line.slice(0, comment) : line
  const tail = comment >= 0 ? line.slice(comment) : ''
  const match = /^(\s*)([A-Za-z_"(][^\s;]*)(\s+)(.*)$/.exec(code)
  return (
    <>
      {match ? (
        <>
          {match[1]}<span className="text-primary-ink">{match[2]}</span>{match[3]}
          {match[4]!.split(/(-?\b\d+\.?\d*(?:[eE][-+]?\d+)?\b)/).map((part, i) => (i % 2 ? <span key={i} className="text-v0">{part}</span> : part))}
        </>
      ) : code}
      {tail && <span className="text-ink-4">{tail}</span>}
    </>
  )
}

function FileBody({ content, referenceLines }: { content: string; referenceLines: Set<string> | null }) {
  const lines = content.replace(/\n$/, '').split('\n')
  let inBlockComment = false
  return (
    <div className="min-w-max py-4 font-mono text-[12.5px] leading-[1.65]">
      {lines.map((line, index) => {
        const startsBlock = line.includes('/*')
        const commentLine = inBlockComment || startsBlock
        if (startsBlock) inBlockComment = true
        if (line.includes('*/')) inBlockComment = false
        const changed = !!referenceLines && line.trim() !== '' && !referenceLines.has(line)
        return (
          <div key={index} className={cn('flex pr-8', changed && 'bg-[#fdf9d2]')}>
            <span className={cn('w-14 shrink-0 select-none border-l-[3px] pr-4 text-right', changed ? 'border-v4 text-ink-2' : 'border-transparent text-ink-4')}>{index + 1}</span>
            <span className="whitespace-pre">{commentLine ? <span className="text-ink-4">{line || ' '}</span> : line ? highlight(line) : ' '}</span>
          </div>
        )
      })}
    </div>
  )
}

export function CaseFilesView({ runId, initialPath }: { runId?: string; initialPath?: string }) {
  const tutorial = useWorkbench((state) => state.tutorial)!
  const workspace = useWorkbench((state) => state.workspace)!
  const applyWorkspace = useWorkbench((state) => state.applyWorkspace)
  const select = useWorkbench((state) => state.select)
  const push = useToasts((state) => state.push)
  const [files, setFiles] = useState<CaseFile[] | null>(null)
  const [reference, setReference] = useState<CaseFile[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [path, setPath] = useState(initialPath ?? 'system/controlDict')
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const readOnly = !!runId
  // Reload whenever the settings behind the generated files change.
  const version = `${JSON.stringify(workspace.values)}|${workspace.overrides.join(',')}`

  useEffect(() => { if (initialPath) { setPath(initialPath); setDraft(null) } }, [initialPath])

  useEffect(() => {
    let alive = true
    const request = runId ? api.runFiles(tutorial.id, runId) : api.files(tutorial.id)
    request.then((data) => { if (alive) { setFiles(data.files); setError(null) } }).catch((e: Error) => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [tutorial.id, runId, version])

  useEffect(() => {
    let alive = true
    if (runId === 'reference') { setReference(null); return }
    api.runFiles(tutorial.id, 'reference').then((data) => { if (alive) setReference(data.files) }).catch(() => undefined)
    return () => { alive = false }
  }, [tutorial.id, runId])

  const file = files?.find((candidate) => candidate.relPath === path) ?? files?.[0]
  const referenceLines = useMemo(() => {
    const match = reference?.find((candidate) => candidate.relPath === file?.relPath)
    return match ? new Set(match.content.split('\n')) : null
  }, [reference, file?.relPath])
  const changedCount = useMemo(() => (file && referenceLines ? file.content.split('\n').filter((line) => line.trim() !== '' && !referenceLines.has(line)).length : 0), [file, referenceLines])

  const save = async () => {
    if (!file || draft === null) return
    setSaving(true)
    setSaveError(null)
    try {
      applyWorkspace(await api.saveFile(tutorial.id, file.relPath, draft))
      setDraft(null)
      push('success', `${file.relPath} saved. Your next run will use this file.`)
    } catch (e) {
      setSaveError((e as Error).message)
    } finally { setSaving(false) }
  }
  const revert = async () => {
    if (!file) return
    try { applyWorkspace(await api.revertFile(tutorial.id, file.relPath)); setDraft(null) } catch (e) { push('error', (e as Error).message) }
  }

  return (
    <div className="flex h-full">
      <div className="flex w-[248px] shrink-0 flex-col border-r">
        <div className="shrink-0 px-5 pb-3 pt-5">
          <p className="t-eyebrow">{readOnly ? 'Inputs of this run' : 'Generated from your settings'}</p>
          <h2 className="t-title mt-1.5 text-[21px]">Case files</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          {!files && !error && <div className="flex items-center gap-2 px-5 py-3 text-ink-3"><Spinner size={13} /> Loading</div>}
          {GROUPS.map((group) => {
            const members = (files ?? []).filter((candidate) => candidate.relPath.startsWith(`${group.dir}/`))
            if (!members.length) return null
            return (
              <div key={group.dir} className="mt-3">
                <div className="flex items-baseline gap-2 px-5 pb-1.5">
                  <span className="t-mono text-[12.5px] font-medium">{group.dir}/</span>
                  <span className="truncate text-[12px] text-ink-3">{group.label}</span>
                </div>
                {members.map((member) => {
                  const selected = member.relPath === file?.relPath
                  return (
                    <button
                      key={member.relPath} type="button"
                      className={cn('relative flex h-8 w-full items-center gap-2 pl-8 pr-4 text-left font-mono text-[12.5px]', selected ? 'bg-primary-tint font-medium' : 'hover:bg-wash')}
                      onClick={() => { if (draft !== null && !window.confirm('Discard your unsaved edits?')) return; setPath(member.relPath); setDraft(null); setSaveError(null); if (!readOnly) select({ kind: 'files', path: member.relPath }) }}
                    >
                      {selected && <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" />}
                      <span className="truncate">{member.relPath.slice(group.dir.length + 1)}</span>
                      {member.overridden && <span className="ml-auto h-2 w-2 shrink-0 bg-v4 outline outline-1 outline-[#c9b700]" title="Edited by hand" />}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {error && <div className="p-6 text-bad">{error}</div>}
        {file && (
          <>
            <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-1.5">
              <span className="t-mono text-[13.5px] font-medium">{file.relPath}</span>
              {file.overridden && <Tag tone="warn">Edited by hand</Tag>}
              {draft === null && changedCount > 0 && <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3"><span className="h-2 w-2 bg-v4 outline outline-1 outline-[#c9b700]" />{changedCount} {changedCount === 1 ? 'line differs' : 'lines differ'} from the reference</span>}
              <div className="flex-1" />
              {!readOnly && draft === null && file.overridden && <Button size="sm" variant="ghost" onClick={() => void revert()}><RotateCcw size={13} /> Back to generated</Button>}
              {!readOnly && draft === null && <Button size="sm" onClick={() => { setDraft(file.content); setSaveError(null) }}><Pencil size={13} /> Edit</Button>}
              {draft !== null && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => { setDraft(null); setSaveError(null) }}>Cancel</Button>
                  <Button size="sm" variant="primary" disabled={saving || draft === file.content} onClick={() => void save()}>{saving ? <Spinner size={13} /> : <Save size={13} />} Save</Button>
                </>
              )}
            </div>
            {draft !== null && (
              <div className="shrink-0 space-y-2 border-b px-5 py-3">
                <Notice tone="info">You are editing the dictionary directly. After saving, the forms no longer write to this file until you go back to the generated version.</Notice>
                {saveError && <Notice tone="error">{saveError}</Notice>}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-auto">
              {draft !== null ? (
                <textarea
                  aria-label={`Edit ${file.relPath}`} spellCheck={false} value={draft} onChange={(event) => setDraft(event.target.value)}
                  className="block h-full w-full resize-none px-5 py-4 font-mono text-[12.5px] leading-[1.65] outline-none"
                />
              ) : <FileBody content={file.content} referenceLines={referenceLines} />}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
