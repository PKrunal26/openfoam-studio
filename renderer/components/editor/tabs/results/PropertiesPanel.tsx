import { useResultsStore, type PipelineItem } from '@/store/useResultsStore'
import { Select as SharedSelect } from '@/components/ui/select'
import { COLORMAPS } from '@/lib/vtk/colormaps'
import { VECTOR_MAGNITUDE, type ComponentSelector } from '@/lib/vtk/fieldStats'
import type { FieldInfo } from '@/lib/vtk/resultsData'
import type { RepresentationMode } from '@/lib/vtk/ResultsEngine'
import type { DomainBounds, Vec3 } from '@/hooks/useResultsViewer'
import { cn } from '@/lib/cn'

const REPRESENTATIONS: { id: RepresentationMode; label: string }[] = [
  { id: 'surface', label: 'Surface' },
  { id: 'surfaceEdges', label: 'Surface with Edges' },
  { id: 'wireframe', label: 'Wireframe' },
  { id: 'points', label: 'Points' },
]

const COMPONENTS: { id: ComponentSelector; label: string }[] = [
  { id: VECTOR_MAGNITUDE, label: 'Magnitude' },
  { id: 0, label: 'X' },
  { id: 1, label: 'Y' },
  { id: 2, label: 'Z' },
]

type RangeMode = PipelineItem['rangeMode']
const RANGE_MODES: { id: RangeMode; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'allTime', label: 'All time' },
  { id: 'manual', label: 'Manual' },
]

// Gradient previews mirroring the vtk.js colormap presets, so users recognise
// the ramp without opening the viewport.
const COLORMAP_GRADIENT: Record<string, string> = {
  coolwarm: 'linear-gradient(90deg,#3b4cc0,#7b9ff9,#e0dbd8,#f49a7b,#b40426)',
  viridis: 'linear-gradient(90deg,#440154,#3b528b,#21918c,#5ec962,#fde725)',
  rainbow: 'linear-gradient(90deg,#000080,#0000ff,#00ffff,#7fff7f,#ffff00,#ff0000,#800000)',
  grayscale: 'linear-gradient(90deg,#000,#fff)',
}

// ── Shared control styling ───────────────────────────────────────────────────

const numberCls =
  'h-7 w-full min-w-0 rounded-md border border-border/80 bg-background px-2 text-xs tabular-nums text-foreground outline-none transition-colors hover:border-border focus:border-ring focus:ring-1 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-40'
const cardCls = 'space-y-2 rounded-md border border-border/70 bg-card/40 p-2.5'
const cardLabelCls = 'text-[10px] font-medium uppercase tracking-wider text-muted-foreground'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function Select({
  value,
  onChange,
  title,
  children,
}: {
  value: string
  onChange: (v: string) => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <SharedSelect value={value} onChange={onChange} title={title} size="sm" className="flex-1">
      {children}
    </SharedSelect>
  )
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex w-full gap-0.5 rounded-md border border-border/80 bg-background p-0.5">
      {options.map((o) => {
        const active = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={cn(
              'flex-1 rounded-[5px] px-2 py-1 text-[11px] font-medium transition-all',
              active
                ? 'bg-accent text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function Slider({
  value,
  min,
  max,
  step,
  onChange,
  disabled,
  title,
}: {
  value: number
  min: number
  max: number
  step: number | string
  onChange: (v: number) => void
  disabled?: boolean
  title?: string
}) {
  const pct = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0
  return (
    <input
      type="range"
      title={title}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className="ofs-slider min-w-0 flex-1"
      style={{ ['--pct' as string]: `${pct}%` }}
    />
  )
}

function ValueBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded bg-accent/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-foreground">
      {children}
    </span>
  )
}

// ── Plane controls (slice + clip) ────────────────────────────────────────────

const AXIS_NORMALS: Record<string, Vec3> = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }

function originForOffset(bounds: DomainBounds, normal: Vec3, t: number): Vec3 {
  const len = Math.hypot(normal[0], normal[1], normal[2]) || 1
  const n: Vec3 = [normal[0] / len, normal[1] / len, normal[2] / len]
  // extent of the bbox projected on the normal
  const ext =
    Math.abs((bounds.max[0] - bounds.min[0]) * n[0]) +
    Math.abs((bounds.max[1] - bounds.min[1]) * n[1]) +
    Math.abs((bounds.max[2] - bounds.min[2]) * n[2])
  const d = (t - 0.5) * ext
  return [bounds.center[0] + d * n[0], bounds.center[1] + d * n[1], bounds.center[2] + d * n[2]]
}

function PlaneControls({
  item,
  bounds,
  update,
}: {
  item: PipelineItem
  bounds: DomainBounds | null
  update: (params: Record<string, unknown>) => void
}) {
  const params = (item.params ?? {}) as { origin?: Vec3; normal?: Vec3; offsetT?: number }
  const normal = params.normal ?? [0, 0, 1]
  const offsetT = params.offsetT ?? 0.5

  const setNormal = (n: Vec3) => {
    if (!bounds) return
    update({ normal: n, origin: originForOffset(bounds, n, offsetT), offsetT })
  }
  const setOffset = (t: number) => {
    if (!bounds) return
    update({ normal, origin: originForOffset(bounds, normal, t), offsetT: t })
  }

  return (
    <div className={cardCls}>
      <p className={cardLabelCls}>Plane</p>
      <div className="flex items-center gap-2 text-xs">
        <span className="shrink-0 text-muted-foreground">Normal</span>
        <div className="flex flex-1 gap-0.5 rounded-md border border-border/80 bg-background p-0.5">
          {Object.entries(AXIS_NORMALS).map(([axis, n]) => {
            const active = normal[0] === n[0] && normal[1] === n[1] && normal[2] === n[2]
            return (
              <button
                key={axis}
                type="button"
                onClick={() => setNormal(n)}
                className={cn(
                  'flex-1 rounded-[5px] px-1.5 py-1 text-[11px] font-medium transition-all',
                  active
                    ? 'bg-accent text-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
                )}
              >
                {axis}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {([0, 1, 2] as const).map((i) => (
          <input
            key={i}
            type="number"
            step="any"
            title={`Normal ${'XYZ'[i]}`}
            className={numberCls}
            value={normal[i]}
            onChange={(e) => {
              const n = [...normal] as Vec3
              n[i] = Number(e.target.value)
              setNormal(n)
            }}
          />
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs">
        <span className="shrink-0 text-muted-foreground">Offset</span>
        <Slider value={offsetT} min={0} max={1} step={0.01} onChange={setOffset} />
        <ValueBadge>{Math.round(offsetT * 100)}%</ValueBadge>
      </label>
    </div>
  )
}

function NumberRow({
  label,
  value,
  onChange,
  step = 'any',
  min,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: string
  min?: number
}) {
  return (
    <Row label={label}>
      <input
        type="number"
        step={step}
        min={min}
        className={numberCls + ' flex-1'}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Row>
  )
}

function Vec3Row({
  label,
  value,
  onChange,
}: {
  label: string
  value: Vec3
  onChange: (v: Vec3) => void
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1.5">
        {([0, 1, 2] as const).map((i) => (
          <input
            key={i}
            type="number"
            step="any"
            className={numberCls}
            value={value[i]}
            onChange={(e) => {
              const v = [...value] as Vec3
              v[i] = Number(e.target.value)
              onChange(v)
            }}
          />
        ))}
      </div>
    </div>
  )
}

export function PropertiesPanel({
  fields,
  bounds,
}: {
  fields: FieldInfo[]
  bounds: DomainBounds | null
}) {
  const items = useResultsStore((s) => s.items)
  const selectedId = useResultsStore((s) => s.selectedId)
  const updateItem = useResultsStore((s) => s.updateItem)
  const item = items.find((i) => i.id === selectedId)

  if (!item) {
    return (
      <div className="flex h-full items-center justify-center p-3 text-center text-xs text-muted-foreground">
        Select a pipeline item to edit its properties.
      </div>
    )
  }

  const fieldInfo = fields.find((f) => f.name === item.field)
  const isVector = (fieldInfo?.numComponents ?? 1) > 1
  const params = (item.params ?? {}) as Record<string, unknown>
  const updateParams = (patch: Record<string, unknown>) =>
    updateItem(item.id, { params: { ...item.params, ...patch } })
  // Streamlines and glyphs are always colored by |U|.
  const fixedUColoring = item.type === 'streamlines' || item.type === 'glyphs'

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <div className="flex items-center gap-2 border-b border-border/60 pb-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/60" />
        <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-foreground">
          {item.label}
        </p>
      </div>

      {(item.type === 'slice' || item.type === 'clip') && (
        <PlaneControls item={item} bounds={bounds} update={updateParams} />
      )}

      {item.type === 'glyphs' && (
        <>
          <NumberRow
            label="Every Nth point"
            step="1"
            min={1}
            value={(params.stride as number) ?? 2}
            onChange={(v) => updateParams({ stride: Math.max(1, Math.round(v)) })}
          />
          <NumberRow
            label="Scale"
            value={(params.scale as number) ?? 1}
            onChange={(v) => updateParams({ scale: v })}
          />
        </>
      )}

      {item.type === 'streamlines' && (
        <>
          <NumberRow
            label="Seeds"
            step="1"
            min={1}
            value={(params.seeds as number) ?? 10}
            onChange={(v) => updateParams({ seeds: Math.max(1, Math.round(v)) })}
          />
          <Vec3Row
            label="Rake start"
            value={(params.p0 as Vec3) ?? [0, 0, 0]}
            onChange={(v) => updateParams({ p0: v })}
          />
          <Vec3Row
            label="Rake end"
            value={(params.p1 as Vec3) ?? [0, 0, 0]}
            onChange={(v) => updateParams({ p1: v })}
          />
        </>
      )}

      {item.type === 'iso' && (
        <div className={cardCls}>
          <div className="flex items-center justify-between">
            <p className={cardLabelCls}>Iso value</p>
            <ValueBadge>{((params.value as number) ?? 0.5).toPrecision(4)}</ValueBadge>
          </div>
          <Slider
            value={(params.value as number) ?? 0.5}
            min={(params.valueMin as number) ?? 0}
            max={(params.valueMax as number) ?? 1}
            step={(((params.valueMax as number) ?? 1) - ((params.valueMin as number) ?? 0)) / 200 || 0.005}
            onChange={(v) => updateParams({ value: v })}
          />
          <input
            type="number"
            step="any"
            className={numberCls}
            value={(params.value as number) ?? 0.5}
            onChange={(e) => updateParams({ value: Number(e.target.value) })}
          />
        </div>
      )}

      {fixedUColoring && (
        <p className="rounded-md border border-border/60 bg-card/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          Colored by U magnitude.
        </p>
      )}

      {!fixedUColoring && (
        <>
          <Row label="Color by">
            <Select
              value={item.field ?? ''}
              onChange={(v) => updateItem(item.id, { field: v || null })}
            >
              <option value="">Solid color</option>
              {fields.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
            </Select>
          </Row>

          {item.field && isVector && (
            <Row label="Component">
              <Select
                value={String(item.component)}
                onChange={(v) => updateItem(item.id, { component: Number(v) as ComponentSelector })}
              >
                {COMPONENTS.map((c) => (
                  <option key={c.label} value={String(c.id)}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Row>
          )}
        </>
      )}

      {item.field && (
        <div className="space-y-1.5">
          <Row label="Colormap">
            <Select value={item.colormap} onChange={(v) => updateItem(item.id, { colormap: v })}>
              {COLORMAPS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Row>
          <div
            className="h-2.5 w-full rounded-full border border-border/60"
            style={{ background: COLORMAP_GRADIENT[item.colormap] ?? COLORMAP_GRADIENT.coolwarm }}
          />
        </div>
      )}

      {item.field && (
        <div className={cardCls}>
          <p className={cardLabelCls}>Range</p>
          <Segmented
            options={RANGE_MODES}
            value={item.rangeMode}
            onChange={(mode) => updateItem(item.id, { rangeMode: mode })}
          />
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="any"
              className={numberCls}
              disabled={item.rangeMode !== 'manual'}
              value={item.manualRange[0]}
              onChange={(e) =>
                updateItem(item.id, { manualRange: [Number(e.target.value), item.manualRange[1]] })
              }
            />
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">to</span>
            <input
              type="number"
              step="any"
              className={numberCls}
              disabled={item.rangeMode !== 'manual'}
              value={item.manualRange[1]}
              onChange={(e) =>
                updateItem(item.id, { manualRange: [item.manualRange[0], Number(e.target.value)] })
              }
            />
          </div>
        </div>
      )}

      {item.type !== 'glyphs' && item.type !== 'streamlines' && (
        <Row label="Representation">
          <Select
            value={item.representation}
            onChange={(v) => updateItem(item.id, { representation: v as RepresentationMode })}
          >
            {REPRESENTATIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </Row>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Opacity</span>
          <ValueBadge>{Math.round(item.opacity * 100)}%</ValueBadge>
        </div>
        <Slider
          value={item.opacity}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => updateItem(item.id, { opacity: v })}
        />
      </div>
    </div>
  )
}
