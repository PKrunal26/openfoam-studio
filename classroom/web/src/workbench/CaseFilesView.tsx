import { useEffect, useMemo, useState } from 'react'
import { FileCode, Pencil, RotateCcw, Save, X } from 'lucide-react'
import { api, type CaseFile } from '@c/api'
import { useToasts, useWorkbench } from '@c/store'
import { Button, Notice, Spinner, cn } from '@c/ui/primitives'

const GROUPS: { dir: string; label: string }[] = [
  { dir: '0', label: '0 — initial and boundary conditions' },
  { dir: 'constant', label: 'constant — physical properties' },
  { dir: 'system', label: 'system — mesh, time and numerics' },
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
          {match[1]}<span className="text-[#0b6aa2]">{match[2]}</span>{match[3]}
          {match[4]!.split(/(-?\b\d+\.?\d*(?:[eE][-+]?\d+)?\b)/).map((part, i) => (i % 2 ? <span key={i} className="text-[#b3420f]">{part}</span> : part))}
        </>
      ) : code}
      {tail && <span className="text-[#7d8894]">{tail}</span>}
    </>
  )
}

function FileBody({ content, referenceLines }: { content: string; referenceLines: Set<string> | null }) {
  const lines = content.replace(/\n$/, '').split('\n')
  let inBlockComment = false
  return (
    <div className="min-w-max py-3 font-mono text-[13px] leading-[1.6]">
      {lines.map((line, index) => {
        const startsBlock = line.includes('/*')
        const commentLine = inBlockComment || startsBlock
        if (startsBlock) inBlockComment = true
        if (line.includes('*/')) inBlockComment = false
        const changed = !!referenceLines && line.trim() !== '' && !referenceLines.has(line)
        return (
          <div key={index} className={cn('flex pr-6', changed && 'bg-[#e4f4fc]')}>
            <span className={cn('w-12 shrink-0 select-none pr-3 text-right text-[#a3acb5]', changed && 'border-l-[3px] border-accent-strong text-accent-foreground')}>{index + 1}</span>
            <span className="whitespace-pre">{commentLine ? <span className="text-[#7d8894]">{line || ' '}</span> : line ? highlight(line) : ' '}</span>
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
    <div className="flex h-full gap-4 p-5">
      <div className="panel flex w-[270px] shrink-0 flex-col overflow-hidden">
        <div className="border-b px-4 py-3">
          <h2 className="text-[17.5px] font-bold">Case files</h2>
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
            {readOnly ? 'The exact OpenFOAM inputs this run was solved with.' : 'The OpenFOAM case generated from your settings.'}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
          {!files && !error && <div className="flex items-center gap-2 px-4 py-3 text-muted-foreground"><Spinner size={14} /> Loading…</div>}
          {GROUPS.map((group) => {
            const members = (files ?? []).filter((candidate) => candidate.relPath.startsWith(`${group.dir}/`))
            if (!members.length) return null
            return (
              <div key={group.dir} className="mb-1">
                <div className="px-4 pb-1 pt-2 text-[12px] font-bold tracking-wide text-muted-foreground uppercase">{group.label}</div>
                {members.map((member) => (
                  <button
                    key={member.relPath} type="button"
                    className={cn('flex h-9 w-full items-center gap-2 px-4 text-left font-mono text-[13.5px]', member.relPath === file?.relPath ? 'bg-accent text-accent-foreground' : 'hover:bg-[#f1f4f6]')}
                    onClick={() => { if (draft !== null && !window.confirm('Discard your unsaved edits?')) return; setPath(member.relPath); setDraft(null); setSaveError(null); if (!readOnly) select({ kind: 'files', path: member.relPath }) }}
                  >
                    <FileCode size={14} className="shrink-0" />
                    <span className="truncate">{member.relPath.slice(group.dir.length + 1)}</span>
                    {member.overridden && <span className="ml-auto rounded bg-warning-bg px-1.5 text-[11px] font-bold text-[#8a5300]" title="Edited by hand">edited</span>}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      <div className="panel flex min-w-0 flex-1 flex-col overflow-hidden">
        {error && <div className="p-5 text-danger">{error}</div>}
        {file && (
          <>
            <div className="flex min-h-[52px] shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2">
              <span className="font-mono text-[15px] font-bold">{file.relPath}</span>
              {file.overridden && <span className="rounded bg-warning-bg px-2 py-0.5 text-[12.5px] font-bold text-[#8a5300]">Edited by hand</span>}
              {draft === null && changedCount > 0 && <span className="text-[13px] text-accent-foreground">{changedCount} {changedCount === 1 ? 'line differs' : 'lines differ'} from the reference</span>}
              <div className="flex-1" />
              {!readOnly && draft === null && file.overridden && <Button size="sm" onClick={() => void revert()}><RotateCcw size={15} /> Back to generated file</Button>}
              {!readOnly && draft === null && <Button size="sm" onClick={() => { setDraft(file.content); setSaveError(null) }}><Pencil size={15} /> Edit</Button>}
              {draft !== null && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => { setDraft(null); setSaveError(null) }}><X size={15} /> Cancel</Button>
                  <Button size="sm" variant="primary" disabled={saving || draft === file.content} onClick={() => void save()}>{saving ? <Spinner size={14} /> : <Save size={15} />} Save</Button>
                </>
              )}
            </div>
            {draft !== null && (
              <div className="shrink-0 space-y-2 border-b bg-[#fafbfc] px-4 py-2.5">
                <Notice tone="info">You are editing the dictionary directly. After saving, the forms no longer write to this file until you go back to the generated version.</Notice>
                {saveError && <Notice tone="error">{saveError}</Notice>}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-auto bg-white">
              {draft !== null ? (
                <textarea
                  aria-label={`Edit ${file.relPath}`} spellCheck={false} value={draft} onChange={(event) => setDraft(event.target.value)}
                  className="block h-full w-full resize-none p-4 font-mono text-[13px] leading-[1.6] outline-none"
                />
              ) : <FileBody content={file.content} referenceLines={referenceLines} />}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
