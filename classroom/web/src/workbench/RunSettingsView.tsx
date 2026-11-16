import { useState } from 'react'
import { ArrowLeft, FileCode, Upload } from 'lucide-react'
import { api, type RunView } from '@c/api'
import { useToasts, useWorkbench } from '@c/store'
import { Button, cn, formatNumber } from '@c/ui/primitives'
import { CaseFilesView } from './CaseFilesView'

export function RunSettingsView({ run }: { run: RunView }) {
  const tutorial = useWorkbench((state) => state.tutorial)!
  const applyWorkspace = useWorkbench((state) => state.applyWorkspace)
  const push = useToasts((state) => state.push)
  const [showFiles, setShowFiles] = useState(false)
  if (showFiles) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-10 shrink-0 items-center border-b px-3">
          <Button size="sm" variant="ghost" onClick={() => setShowFiles(false)}><ArrowLeft size={13} /> Back to settings</Button>
        </div>
        <div className="min-h-0 flex-1"><CaseFilesView runId={run.id} /></div>
      </div>
    )
  }
  const load = async () => {
    const values: Record<string, number | string> = {}
    for (const def of tutorial.params) values[def.id] = run.changed[def.id] ?? def.default
    try {
      applyWorkspace(await api.setValues(tutorial.id, values))
      push('success', `Settings of ${run.isReference ? 'the reference' : run.label} loaded into the setup.`)
    } catch (e) { push('error', (e as Error).message) }
  }
  const labelFor = (paramId: string, value: number | string) => {
    const def = tutorial.params.find((candidate) => candidate.id === paramId)
    if (def?.type === 'select') return def.options?.find((option) => option.value === value)?.label ?? String(value)
    return typeof value === 'number' ? formatNumber(value, 6) : String(value)
  }
  const changedCount = Object.keys(run.changed).length
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[860px] px-8 py-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="t-eyebrow">{run.isReference ? 'The tutorial’s reference setup' : changedCount ? `${changedCount} ${changedCount === 1 ? 'setting differs' : 'settings differ'} from the reference` : 'Same form settings as the reference'}</p>
            <h2 className="t-title mt-1.5 text-[24px]">Settings used</h2>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setShowFiles(true)}><FileCode size={14} /> Case files</Button>
            <Button variant="ink" onClick={() => void load()} title="Copy these values into the setup forms"><Upload size={14} /> Load into setup</Button>
          </div>
        </div>

        {run.overridden.length > 0 && (
          <p className="mt-5 text-[13.5px] text-ink-2">Files edited by hand in this run: {run.overridden.map((file) => <span key={file} className="t-mono mr-2.5 text-ink">{file}</span>)}</p>
        )}

        <table className="mt-7 w-full text-left text-[13.5px]">
          <thead>
            <tr className="border-b border-ink">
              <th className="t-eyebrow pb-2 pr-4 font-medium">Setting</th>
              <th className="t-eyebrow pb-2 pr-4 font-medium">This run</th>
              <th className="t-eyebrow pb-2 font-medium">Reference</th>
            </tr>
          </thead>
          <tbody>
            {tutorial.params.map((def) => {
              const value = run.changed[def.id] ?? def.default
              const changed = def.id in run.changed
              return (
                <tr key={def.id} className="border-b">
                  <td className="py-2.5 pr-4">
                    <span className="flex items-center gap-2">
                      <span className={cn('h-2 w-2 shrink-0', changed ? 'bg-v4 outline outline-1 outline-[#c9b700]' : 'bg-transparent')} />
                      {def.label}{def.symbol && <span className="font-mono text-[12px] text-ink-3">{def.symbol}</span>}
                    </span>
                  </td>
                  <td className={cn('py-2.5 pr-4', def.type === 'number' && 't-mono', changed && 'font-medium')}>{labelFor(def.id, value)}{def.unit && <span className="ml-1.5 font-mono text-[12px] font-normal text-ink-3">{def.unit}</span>}</td>
                  <td className={cn('py-2.5 text-ink-3', def.type === 'number' && 't-mono')}>{labelFor(def.id, def.default)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
