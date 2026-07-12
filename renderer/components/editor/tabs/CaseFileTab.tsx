import { useEffect, useRef } from 'react'
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { useEditorStore, type EditorTab } from '@/store/useEditorStore'

// Wire Monaco workers via Vite (?worker imports). Defaults to the base editor
// worker for all languages — adequate for plain-text dict files.
;(self as unknown as { MonacoEnvironment: { getWorker: () => Worker } }).MonacoEnvironment = {
  getWorker: () => new editorWorker(),
}
loader.config({ monaco })

interface Props {
  tab: EditorTab
  projectId: string
}

export function CaseFileTab({ tab, projectId }: Props) {
  const updateContent = useEditorStore((s) => s.updateContent)
  const saveTab = useEditorStore((s) => s.saveTab)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)

  // Save on Cmd/Ctrl+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (tab.content !== tab.savedContent) saveTab(projectId, tab.id).catch(() => {})
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab.id, tab.content, tab.savedContent, projectId, saveTab])

  if (tab.loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading {tab.relPath}…
      </div>
    )
  }
  if (tab.error) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-destructive">
        {tab.error}
      </div>
    )
  }

  const dirty = tab.content !== tab.savedContent

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-7 shrink-0 items-center justify-between border-b bg-sidebar/40 px-3 text-[11px] text-muted-foreground">
        <span className="truncate font-mono">{tab.relPath}</span>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-amber-500">●  unsaved</span>}
          <button
            onClick={() => saveTab(projectId, tab.id).catch(() => {})}
            disabled={!dirty}
            className="rounded-sm px-2 py-0.5 hover:bg-accent disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <Editor
          path={tab.relPath}
          theme="vs-dark"
          language="cpp"
          value={tab.content ?? ''}
          onChange={(v) => updateContent(tab.id, v ?? '')}
          onMount={(ed) => {
            editorRef.current = ed
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            scrollBeyondLastLine: false,
            renderLineHighlight: 'gutter',
            tabSize: 4,
            insertSpaces: true,
            wordWrap: 'off',
            smoothScrolling: true,
            cursorBlinking: 'smooth',
          }}
        />
      </div>
    </div>
  )
}
