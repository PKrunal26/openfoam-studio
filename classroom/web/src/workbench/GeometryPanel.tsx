import { ChevronDown, Cuboid, Eye, EyeOff } from 'lucide-react'
import { useWorkbench } from '@c/store'
import { cn } from '@c/ui/primitives'
import { ItemIcon } from './icons'

/** Floating list of the mesh's boundary patches (the "faces" of this geometry). */
export function GeometryPanel({ highlighted, available }: { highlighted: string[]; available: string[] }) {
  const tutorial = useWorkbench((state) => state.tutorial)!
  const hidden = useWorkbench((state) => state.hiddenPatches)
  const togglePatch = useWorkbench((state) => state.togglePatch)
  const setFocusPatch = useWorkbench((state) => state.setFocusPatch)
  const select = useWorkbench((state) => state.select)
  const bcItems = tutorial.sections.find((section) => section.node === 'boundaryConditions')?.items ?? []
  return (
    <div className="panel-float w-[292px] overflow-hidden">
      <div className="flex h-11 items-center gap-2 border-b px-3.5">
        <ChevronDown size={15} className="text-[#77838f]" />
        <span className="section-label">Geometry</span>
      </div>
      <div className="flex h-10 items-center gap-2 bg-accent px-3.5 text-[15px] font-bold text-accent-foreground">
        <Cuboid size={16} /> <span className="truncate">{tutorial.geometry.name}</span>
      </div>
      <div className="py-1">
        {tutorial.geometry.patches.map((patch) => {
          const present = available.length === 0 || available.includes(patch.name)
          const isHidden = hidden.includes(patch.name)
          const owner = bcItems.find((item) => item.patches?.includes(patch.name))
          return (
            <div
              key={patch.name}
              className={cn('group flex h-9 items-center gap-2 pl-7 pr-2 text-[14.5px]', highlighted.includes(patch.name) ? 'bg-accent text-accent-foreground' : 'hover:bg-[#f1f4f6]')}
              onMouseEnter={() => setFocusPatch(patch.name)} onMouseLeave={() => setFocusPatch(null)}
            >
              <button type="button" className={cn('flex min-w-0 flex-1 items-center gap-2 text-left', (!present || isHidden) && 'opacity-50')} onClick={() => owner && select({ kind: 'item', itemId: owner.id })} title={owner ? `Open the boundary condition for ${patch.label}` : patch.label}>
                <ItemIcon icon={patch.kind} size={15} />
                <span className="truncate">{patch.label}</span>
              </button>
              <button type="button" aria-label={isHidden ? `Show ${patch.label}` : `Hide ${patch.label}`} title={isHidden ? 'Show' : 'Hide'} className="flex h-7 w-7 items-center justify-center rounded text-[#77838f] hover:bg-[#dfe5ea]" onClick={() => togglePatch(patch.name)}>
                {isHidden ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          )
        })}
      </div>
      <div className="border-t px-3.5 py-2.5 text-[12.5px] leading-snug text-muted-foreground">{tutorial.geometry.description}</div>
    </div>
  )
}
