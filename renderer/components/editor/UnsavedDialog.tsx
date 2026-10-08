import { useRef, useState } from 'react'
import { useEditorStore } from '@/store/useEditorStore'
import { useDialogFocus } from '@/hooks/useDialogFocus'
export function UnsavedDialog() {
  const pending = useEditorStore((s) => s.pending)
  const settle = useEditorStore((s) => s.settlePending)
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useDialogFocus(ref, !!pending, () => { if (!busy) void settle('cancel') })
  if (!pending) return null
  const choose = async (decision: 'save' | 'discard' | 'cancel') => {
    setBusy(true); setError(null)
    try { await settle(decision) } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setBusy(false) }
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="unsaved-title" className="w-full max-w-md rounded-lg border bg-card p-6">
      <h2 id="unsaved-title" className="text-base font-medium">Save your changes?</h2>
      <p className="mt-2 text-sm text-muted-foreground">{pending.ids.length} file buffer{pending.ids.length === 1 ? '' : 's'} contain unsaved edits. Save them before leaving, or discard them.</p>
      {error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button disabled={busy} onClick={() => void choose('cancel')} className="rounded border px-3 py-2 text-xs">Cancel</button>
        <button disabled={busy} onClick={() => void choose('discard')} className="rounded border px-3 py-2 text-xs">Discard</button>
        <button disabled={busy} onClick={() => void choose('save')} className="rounded bg-primary px-3 py-2 text-xs text-primary-foreground">{busy ? 'Saving…' : 'Save and continue'}</button>
      </div>
    </div>
  </div>
}
