import { AlertTriangle, Wrench, Loader2 } from 'lucide-react'
import { useRunsStore, type DiagnosisResult } from '@/store/useRunsStore'
import { useProjectStore } from '@/store/useProjectStore'
import { useEditorStore } from '@/store/useEditorStore'

interface Props {
  diagnosis: DiagnosisResult
}

export function DiagnosisDiffBlock({ diagnosis }: Props) {
  const project = useProjectStore((s) => s.project)
  const openCaseFile = useEditorStore((s) => s.openCaseFile)
  const applying = useRunsStore((s) => s.applying)
  const status = useRunsStore((s) => s.status)
  const applyFix = useRunsStore((s) => s.applyFix)

  const onApply = () => {
    if (!project) return
    applyFix(project.id, diagnosis.fix).catch(() => {})
  }

  // Once we successfully re-ran, the store's diagnosis becomes null and this
  // component unmounts. While running, disable the apply button.
  const busy = applying || status === 'running'

  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2.5 text-xs">
      <div className="flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500">
          Diagnosis · {diagnosis.errorClass}
        </span>
      </div>
      <p className="mt-1 leading-relaxed text-foreground/90">{diagnosis.description}</p>

      <div className="mt-2 grid gap-1.5">
        {diagnosis.fix.map((f, i) => (
          <div key={i} className="rounded-md border bg-background px-2 py-1.5">
            <button
              onClick={() => project && openCaseFile(project.id, f.file)}
              className="font-mono text-[11px] text-foreground/85 hover:text-foreground hover:underline"
            >
              {f.file}
            </button>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{f.description}</p>
            {f.oldValue !== f.newValue && f.oldValue !== 'ADD_UFINAL' && f.oldValue !== 'HALVE_DELTA_T' && (
              <pre className="mt-1 grid gap-0.5 overflow-x-auto rounded-sm bg-muted/30 px-1.5 py-1 font-mono text-[10px]">
                <span className="text-rose-400">- {f.oldValue.slice(0, 80)}</span>
                <span className="text-emerald-400">+ {f.newValue.slice(0, 80)}</span>
              </pre>
            )}
            {(f.oldValue === 'ADD_UFINAL' || f.oldValue === 'HALVE_DELTA_T') && (
              <p className="mt-1 italic text-[10px] text-muted-foreground">
                Special fix · backend handles the patch
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2.5 flex items-center justify-end">
        <button
          onClick={onApply}
          disabled={busy}
          className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Wrench className="h-3 w-3" />
          )}
          {busy ? 'Applying & re-running…' : 'Apply fix and re-run'}
        </button>
      </div>
    </div>
  )
}
