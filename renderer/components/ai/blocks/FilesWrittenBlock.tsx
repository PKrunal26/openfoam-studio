import { FileText } from 'lucide-react'
import { useEditorStore } from '@/store/useEditorStore'
import { useProjectStore } from '@/store/useProjectStore'

interface Props {
  files: string[]
}

export function FilesWrittenBlock({ files }: Props) {
  const project = useProjectStore((s) => s.project)
  const openCaseFile = useEditorStore((s) => s.openCaseFile)

  if (files.length === 0) return null

  return (
    <div className="rounded-md border bg-muted/10 px-3 py-2">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Writing files ({files.length})
      </div>
      <ul className="grid gap-0.5">
        {files.map((f) => (
          <li key={f}>
            <button
              onClick={() => project && openCaseFile(project.id, f)}
              className="flex items-center gap-1.5 text-[11px] text-foreground/85 hover:text-foreground"
            >
              <FileText className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono">{f}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
