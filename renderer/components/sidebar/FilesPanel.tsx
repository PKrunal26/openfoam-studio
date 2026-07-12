import { useMemo, useState } from 'react'
import { ChevronRight, ChevronDown, File as FileIcon, Folder, FolderOpen } from 'lucide-react'
import { useProjectStore } from '@/store/useProjectStore'
import { useEditorStore } from '@/store/useEditorStore'
import { cn } from '@/lib/cn'

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children: TreeNode[]
  group?: 'time-output'
}

const PINNED_TOP = ['system', 'constant', '0']

function isTimestepDir(name: string): boolean {
  // Numeric timestep dirs like "0.1", "1", "1.5e-3", but NOT "0" (which is the IC dir).
  if (name === '0') return false
  return /^\d+(\.\d+)?(e[+-]?\d+)?$/i.test(name)
}

function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: '', path: '', isDir: true, children: [] }
  for (const p of paths.slice().sort()) {
    const parts = p.split('/').filter(Boolean)
    let node = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLeaf = i === parts.length - 1
      let child = node.children.find((c) => c.name === part)
      if (!child) {
        child = {
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          isDir: !isLeaf,
          children: [],
        }
        node.children.push(child)
      }
      node = child
    }
  }

  const sortRec = (n: TreeNode) => {
    n.children.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
    n.children.forEach(sortRec)
  }
  sortRec(root)

  // At the top level: pin system/constant/0 first, group all numeric timestep
  // dirs under a synthetic "Time output" folder, leave the rest alphabetical.
  const pinned = PINNED_TOP
    .map((name) => root.children.find((c) => c.name === name))
    .filter((c): c is TreeNode => Boolean(c))
  const timesteps = root.children.filter((c) => c.isDir && isTimestepDir(c.name))
  const others = root.children.filter(
    (c) => !PINNED_TOP.includes(c.name) && !timesteps.includes(c),
  )

  const reordered: TreeNode[] = [...pinned, ...others]
  if (timesteps.length > 0) {
    reordered.push({
      name: `Time output (${timesteps.length})`,
      path: '__time_output__',
      isDir: true,
      children: timesteps,
      group: 'time-output',
    })
  }
  root.children = reordered
  return root
}

interface NodeProps {
  node: TreeNode
  depth: number
  expanded: Set<string>
  toggle: (path: string) => void
  onOpenFile: (relPath: string) => void
  activeRelPath: string | null
}

function Node({ node, depth, expanded, toggle, onOpenFile, activeRelPath }: NodeProps) {
  const isExpanded = expanded.has(node.path)
  const indent = { paddingLeft: `${depth * 12 + 8}px` }
  const isActive = !node.isDir && activeRelPath === node.path

  if (node.isDir) {
    return (
      <>
        <button
          onClick={() => toggle(node.path)}
          style={indent}
          className={cn(
            'flex h-6 w-full items-center gap-1 pr-2 text-xs text-foreground/90 hover:bg-sidebar-accent/60',
          )}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          {isExpanded ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {isExpanded &&
          node.children.map((c) => (
            <Node
              key={c.path}
              node={c}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              onOpenFile={onOpenFile}
              activeRelPath={activeRelPath}
            />
          ))}
      </>
    )
  }

  return (
    <button
      onClick={() => onOpenFile(node.path)}
      style={indent}
      className={cn(
        'flex h-6 w-full items-center gap-1 pr-2 text-xs hover:bg-sidebar-accent/60',
        isActive ? 'bg-sidebar-accent text-foreground' : 'text-foreground/80',
      )}
    >
      <span className="w-3 shrink-0" />
      <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{node.name}</span>
    </button>
  )
}

export function FilesPanel() {
  const project = useProjectStore((s) => s.project)
  const files = useProjectStore((s) => s.files)
  const loading = useProjectStore((s) => s.loading)
  const error = useProjectStore((s) => s.error)
  const openCaseFile = useEditorStore((s) => s.openCaseFile)
  const activeId = useEditorStore((s) => s.activeId)
  const tabs = useEditorStore((s) => s.tabs)
  const activeTab = tabs.find((t) => t.id === activeId)
  const activeRelPath =
    activeTab?.kind === 'case' && activeTab.relPath ? activeTab.relPath : null

  const tree = useMemo(() => buildTree(files.map((f) => f.relPath)), [files])
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Default-expand top-level OpenFOAM dirs (system, constant, 0)
    return new Set(['system', 'constant', '0'])
  })

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })

  if (!project) {
    return (
      <div className="px-3 py-2 text-sm text-muted-foreground">
        <p className="text-xs">No project loaded.</p>
      </div>
    )
  }
  if (loading) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">Loading files…</div>
    )
  }
  if (error) {
    return <div className="px-3 py-2 text-xs text-destructive">{error}</div>
  }
  if (files.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">
        No case files yet. Use the assistant to generate them.
      </div>
    )
  }

  return (
    <div className="py-1">
      {tree.children.map((c) => (
        <Node
          key={c.path}
          node={c}
          depth={0}
          expanded={expanded}
          toggle={toggle}
          onOpenFile={(rel) => openCaseFile(project.id, rel)}
          activeRelPath={activeRelPath}
        />
      ))}
    </div>
  )
}
