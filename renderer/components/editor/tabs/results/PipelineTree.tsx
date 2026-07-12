import { useState } from 'react'
import { Eye, EyeOff, Trash2, Layers, Square, Plus, Scissors, Wind, Mountain, MoveRight, Slice } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useResultsStore, type PipelineItem } from '@/store/useResultsStore'

export type DerivedType = 'slice' | 'clip' | 'glyphs' | 'streamlines' | 'iso'

const ADD_OPTIONS: { type: DerivedType; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { type: 'slice', label: 'Slice', Icon: Slice },
  { type: 'clip', label: 'Clip', Icon: Scissors },
  { type: 'glyphs', label: 'Vector glyphs', Icon: MoveRight },
  { type: 'streamlines', label: 'Streamlines', Icon: Wind },
  { type: 'iso', label: 'Iso-surface', Icon: Mountain },
]

// Mesh and boundary patches are intrinsic to the case — only derived objects
// (slices, streamlines, ...) can be deleted from the pipeline.
const DELETABLE = new Set(['slice', 'clip', 'glyphs', 'streamlines', 'iso'])

function TreeRow({ item }: { item: PipelineItem }) {
  const selectedId = useResultsStore((s) => s.selectedId)
  const select = useResultsStore((s) => s.select)
  const updateItem = useResultsStore((s) => s.updateItem)
  const removeItem = useResultsStore((s) => s.removeItem)
  const isSelected = item.id === selectedId

  return (
    <li
      onClick={() => select(item.id)}
      className={cn(
        'group flex cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1 text-xs',
        isSelected ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <button
        type="button"
        title={item.visible ? 'Hide' : 'Show'}
        onClick={(e) => {
          e.stopPropagation()
          updateItem(item.id, { visible: !item.visible })
        }}
        className="flex h-4 w-4 shrink-0 items-center justify-center hover:text-foreground"
      >
        {item.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3 opacity-50" />}
      </button>
      {item.type === 'mesh' ? (
        <Layers className="h-3 w-3 shrink-0" />
      ) : (
        <Square className="h-3 w-3 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.field && <span className="text-[10px] opacity-60">{item.field}</span>}
      {DELETABLE.has(item.type) && (
        <button
          type="button"
          title="Delete"
          onClick={(e) => {
            e.stopPropagation()
            removeItem(item.id)
          }}
          className="hidden h-4 w-4 items-center justify-center hover:text-destructive group-hover:flex"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </li>
  )
}

export function PipelineTree({ onAdd }: { onAdd?: (type: DerivedType) => void }) {
  const items = useResultsStore((s) => s.items)
  const [menuOpen, setMenuOpen] = useState(false)
  const mesh = items.filter((i) => i.type === 'mesh')
  const patches = items.filter((i) => i.type === 'patch')
  const derived = items.filter((i) => i.type !== 'mesh' && i.type !== 'patch')

  return (
    <div className="flex h-full flex-col overflow-y-auto p-2">
      <div className="relative flex items-center justify-between px-2 pb-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Pipeline
        </p>
        {onAdd && (
          <button
            type="button"
            title="Add object"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
        {menuOpen && onAdd && (
          <ul className="absolute right-1 top-5 z-10 w-36 rounded-sm border bg-popover py-1 shadow-md">
            {ADD_OPTIONS.map(({ type, label, Icon }) => (
              <li key={type}>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onAdd(type)
                  }}
                  className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ul className="space-y-0.5">
        {mesh.map((i) => (
          <TreeRow key={i.id} item={i} />
        ))}
      </ul>
      {patches.length > 0 && (
        <>
          <p className="px-2 pb-1 pt-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Boundaries
          </p>
          <ul className="space-y-0.5">
            {patches.map((i) => (
              <TreeRow key={i.id} item={i} />
            ))}
          </ul>
        </>
      )}
      {derived.length > 0 && (
        <>
          <p className="px-2 pb-1 pt-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Objects
          </p>
          <ul className="space-y-0.5">
            {derived.map((i) => (
              <TreeRow key={i.id} item={i} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
