import { FileCode, Upload } from 'lucide-react'
import { api, type RunView } from '@c/api'
import { useToasts, useWorkbench } from '@c/store'
import { Badge, Button, formatDuration, formatNumber } from '@c/ui/primitives'
import { CaseFilesView } from './CaseFilesView'
import { useState } from 'react'

export function RunSettingsView({ run }: { run: RunView }) {
  const tutorial = useWorkbench((state) => state.tutorial)!
  const applyWorkspace = useWorkbench((state) => state.applyWorkspace)
  const push = useToasts((state) => state.push)
  const [showFiles, setShowFiles] = useState(false)
  if (showFiles) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b bg-white px-5">
          <Button size="sm" variant="ghost" onClick={() => setShowFiles(false)}>← Back to settings</Button>
          <span className="text-[14px] text-muted-foreground">{run.isReference ? 'Run 1 · Reference' : run.label}</span>
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
    <div className="h-full overflow-y-auto p-5">
      <div className="mx-auto max-w-[900px] space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[21px] font-bold">{run.isReference ? 'Run 1 · Reference' : run.label} settings</h2>
            <p className="text-[14px] text-muted-foreground">
              {run.isReference ? 'The tutorial’s reference setup.' : changedCount ? `${changedCount} ${changedCount === 1 ? 'setting differs' : 'settings differ'} from the reference.` : 'Same form settings as the reference.'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setShowFiles(true)}><FileCode size={16} /> View case files</Button>
            <Button onClick={() => void load()} title="Copy these values into the setup forms"><Upload size={16} /> Load into setup</Button>
          </div>
        </div>

        {run.result && (
          <div className="panel grid grid-cols-2 gap-x-6 gap-y-3 p-4 sm:grid-cols-4">
            {[
              ['Mesh cells', run.result.cells?.toLocaleString() ?? '–'],
              [tutorial.run.steady ? 'Iterations' : 'Final time', run.result.finalTime === null ? '–' : `${formatNumber(run.result.finalTime, 5)}${tutorial.run.steady ? '' : ' s'}`],
              ['Compute time', formatDuration(run.result.durationMs)],
              ['Outcome', run.status === 'succeeded' ? (run.result.converged ? 'Converged' : 'Completed') : 'Failed'],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-[12.5px] font-bold tracking-wide text-muted-foreground uppercase">{label}</div>
                <div className="mt-0.5 text-[18px] font-bold tabular-nums">{value}</div>
              </div>
            ))}
          </div>
        )}

        {run.overridden.length > 0 && (
          <div className="panel p-4 text-[14.5px]">
            <span className="font-bold">Hand-edited files in this run:</span>{' '}
            {run.overridden.map((file) => <span key={file} className="mr-2 font-mono text-[13px]">{file}</span>)}
          </div>
        )}

        <div className="panel overflow-hidden">
          <table className="w-full text-left text-[14.5px]">
            <thead className="border-b bg-[#fafbfc] text-[12.5px] tracking-wide text-muted-foreground uppercase">
              <tr><th className="px-4 py-2.5 font-bold">Setting</th><th className="px-4 py-2.5 font-bold">This run</th><th className="px-4 py-2.5 font-bold">Reference</th></tr>
            </thead>
            <tbody>
              {tutorial.params.map((def) => {
                const value = run.changed[def.id] ?? def.default
                const changed = def.id in run.changed
                return (
                  <tr key={def.id} className={changed ? 'bg-[#eef8fd]' : undefined}>
                    <td className="border-b px-4 py-2.5">{def.symbol && <span className="mr-1 text-muted-foreground">({def.symbol})</span>}{def.label}</td>
                    <td className="border-b px-4 py-2.5 tabular-nums">
                      <span className={changed ? 'font-bold' : undefined}>{labelFor(def.id, value)}</span>{def.unit && <span className="ml-1 text-muted-foreground">{def.unit}</span>}
                      {changed && <span className="ml-2"><Badge tone="accent">changed</Badge></span>}
                    </td>
                    <td className="border-b px-4 py-2.5 tabular-nums text-muted-foreground">{labelFor(def.id, def.default)}{def.unit && <span className="ml-1">{def.unit}</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
