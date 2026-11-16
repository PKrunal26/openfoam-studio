import { useEffect, useMemo, useRef, useState } from 'react'
import { api, isActive, type Convergence, type RunView } from '@c/api'
import { useWorkbench } from '@c/store'
import { Spinner, cn, formatNumber } from '@c/ui/primitives'

const COLORS = ['#1976d2', '#e4572e', '#2e9e5b', '#8e44ad', '#d39e00', '#00a3a3', '#c2185b', '#5d6d7e']

interface Series { name: string; color: string; values: (number | null)[] }

function niceTicks(lo: number, hi: number, target = 6): number[] {
  if (!(hi > lo)) return [lo]
  const raw = (hi - lo) / target
  const power = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw
  const ticks: number[] = []
  for (let value = Math.ceil(lo / step) * step; value <= hi + step * 1e-9; value += step) ticks.push(Number(value.toPrecision(12)))
  return ticks
}

function Chart({ title, x, series, log, xLabel, yLabel, refLine, settled }: {
  title: string; x: number[]; series: Series[]; log: boolean; xLabel: string; yLabel: string; refLine?: { value: number; label: string }
  /** Scale the y axis to the later 85% of the run so a start-up transient does not flatten the plot. */
  settled?: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [hover, setHover] = useState<number | null>(null)
  const [off, setOff] = useState<string[]>([])
  useEffect(() => {
    const element = wrapRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => { const w = entries[0]?.contentRect.width; if (w && w > 0) setWidth(w) })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const height = 300
  const margin = { left: 64, right: 18, top: 12, bottom: 40 }
  const innerW = Math.max(50, width - margin.left - margin.right)
  const innerH = height - margin.top - margin.bottom
  const shown = series.filter((entry) => !off.includes(entry.name))

  const scale = useMemo(() => {
    let lo = Infinity, hi = -Infinity
    const from = settled ? Math.floor(x.length * 0.15) : 0
    for (const entry of shown) for (let i = from; i < entry.values.length; i++) {
      const value = entry.values[i]
      if (value == null || !Number.isFinite(value) || (log && value <= 0)) continue
      if (value < lo) lo = value
      if (value > hi) hi = value
    }
    if (refLine && !log) { lo = Math.min(lo, refLine.value); hi = Math.max(hi, refLine.value) }
    if (lo === Infinity) { lo = log ? 1e-6 : 0; hi = 1 }
    if (log) { lo = Math.pow(10, Math.floor(Math.log10(lo))); hi = Math.pow(10, Math.ceil(Math.log10(hi))); if (lo === hi) lo = hi / 10 }
    else if (settled) { const pad = (hi - lo || Math.abs(hi) || 1) * 0.12; lo -= pad; hi += pad }
    else { if (lo > 0) lo = 0; if (lo === hi) hi = lo + 1; hi += (hi - lo) * 0.06 }
    const x0 = x[0] ?? 0
    const x1 = x[x.length - 1] ?? 1
    const sx = (value: number) => margin.left + (x1 === x0 ? 0.5 : (value - x0) / (x1 - x0)) * innerW
    const sy = (value: number) => margin.top + (1 - (log ? (Math.log10(value) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)) : (value - lo) / (hi - lo))) * innerH
    const yTicks = log
      ? Array.from({ length: Math.round(Math.log10(hi) - Math.log10(lo)) + 1 }, (_, i) => Math.pow(10, Math.round(Math.log10(lo)) + i)).filter((_, i, all) => all.length <= 9 || i % Math.ceil(all.length / 8) === 0)
      : niceTicks(lo, hi)
    return { lo, hi, x0, x1, sx, sy, yTicks, xTicks: niceTicks(x0, x1, Math.max(3, Math.floor(innerW / 110))) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.map((entry) => entry.name).join('|'), series, x, log, innerW, refLine?.value])

  const path = (values: (number | null)[]) => {
    let d = ''
    let pen = false
    values.forEach((value, i) => {
      if (value === null || !Number.isFinite(value) || (log && value <= 0)) { pen = false; return }
      d += `${pen ? 'L' : 'M'}${scale.sx(x[i]!).toFixed(1)} ${scale.sy(Math.min(scale.hi, Math.max(value, scale.lo))).toFixed(1)}`
      pen = true
    })
    return d
  }

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (x.length === 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const fraction = (event.clientX - rect.left - margin.left) / innerW
    if (fraction < -0.02 || fraction > 1.02) { setHover(null); return }
    const target = scale.x0 + Math.min(1, Math.max(0, fraction)) * (scale.x1 - scale.x0)
    let best = 0
    for (let i = 1; i < x.length; i++) if (Math.abs(x[i]! - target) < Math.abs(x[best]! - target)) best = i
    setHover(best)
  }

  return (
    <div className="panel p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 className="text-[16.5px] font-bold">{title}</h3>
        <div className="flex flex-wrap gap-1.5">
          {series.map((entry) => {
            const hidden = off.includes(entry.name)
            return (
              <button
                key={entry.name} type="button" aria-pressed={!hidden} title={hidden ? `Show ${entry.name}` : `Hide ${entry.name}`}
                className={cn('flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[13px]', hidden ? 'text-[#a3acb5]' : 'bg-white')}
                onClick={() => setOff((current) => hidden ? current.filter((name) => name !== entry.name) : [...current, entry.name])}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: hidden ? '#c5cdd5' : entry.color }} />
                {entry.name}
                {hover !== null && !hidden && entry.values[hover] != null && <span className="tabular-nums text-muted-foreground">{formatNumber(entry.values[hover]!, 3)}</span>}
              </button>
            )
          })}
        </div>
      </div>
      <div ref={wrapRef} className="w-full">
        <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={title}>
          {scale.yTicks.map((tick) => (
            <g key={tick}>
              <line x1={margin.left} x2={margin.left + innerW} y1={scale.sy(tick)} y2={scale.sy(tick)} stroke="#e6eaee" />
              <text x={margin.left - 8} y={scale.sy(tick) + 4} textAnchor="end" fontSize="12" fill="#66727f">{log ? `1e${Math.round(Math.log10(tick))}` : formatNumber(tick, 3)}</text>
            </g>
          ))}
          {scale.xTicks.map((tick) => (
            <g key={tick}>
              <line x1={scale.sx(tick)} x2={scale.sx(tick)} y1={margin.top + innerH} y2={margin.top + innerH + 5} stroke="#aab4be" />
              <text x={scale.sx(tick)} y={margin.top + innerH + 19} textAnchor="middle" fontSize="12" fill="#66727f">{formatNumber(tick, 4)}</text>
            </g>
          ))}
          <rect x={margin.left} y={margin.top} width={innerW} height={innerH} fill="none" stroke="#cfd6dd" />
          {refLine && !log && refLine.value <= scale.hi && (
            <g>
              <line x1={margin.left} x2={margin.left + innerW} y1={scale.sy(refLine.value)} y2={scale.sy(refLine.value)} stroke="#cf3a3a" strokeDasharray="5 4" />
              <text x={margin.left + innerW - 6} y={scale.sy(refLine.value) - 5} textAnchor="end" fontSize="12" fill="#cf3a3a">{refLine.label}</text>
            </g>
          )}
          {shown.map((entry) => <path key={entry.name} d={path(entry.values)} fill="none" stroke={entry.color} strokeWidth="1.8" strokeLinejoin="round" />)}
          {hover !== null && x[hover] !== undefined && (
            <g>
              <line x1={scale.sx(x[hover]!)} x2={scale.sx(x[hover]!)} y1={margin.top} y2={margin.top + innerH} stroke="#66727f" strokeDasharray="3 3" />
              <text x={Math.min(margin.left + innerW - 4, scale.sx(x[hover]!) + 6)} y={margin.top + 14} fontSize="12" fill="#232a33" textAnchor={scale.sx(x[hover]!) > margin.left + innerW - 90 ? 'end' : 'start'}>{xLabel} {formatNumber(x[hover]!, 5)}</text>
            </g>
          )}
          <text x={margin.left + innerW / 2} y={height - 4} textAnchor="middle" fontSize="12.5" fill="#4b5661">{xLabel}</text>
          <text transform={`translate(14 ${margin.top + innerH / 2}) rotate(-90)`} textAnchor="middle" fontSize="12.5" fill="#4b5661">{yLabel}</text>
        </svg>
      </div>
    </div>
  )
}

export function ConvergenceView({ run }: { run: RunView }) {
  const tutorial = useWorkbench((state) => state.tutorial)!
  const [data, setData] = useState<Convergence | null>(null)
  const [error, setError] = useState<string | null>(null)
  const active = isActive(run.status)

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = () => api.convergence(tutorial.id, run.id).then((result) => {
      if (!alive) return
      setData(result)
      setError(null)
      if (result.live) timer = setTimeout(load, 2000)
    }).catch((e: Error) => { if (alive) setError(e.message) })
    void load()
    return () => { alive = false; if (timer) clearTimeout(timer) }
  }, [tutorial.id, run.id, run.status])

  const steady = tutorial.run.steady
  const xLabel = steady ? 'Iteration' : 'Time (s)'
  const residuals: Series[] = useMemo(() => Object.entries(data?.residuals ?? {}).map(([name, values], i) => ({ name, values, color: COLORS[i % COLORS.length]! })), [data])
  const hasCourant = !!data?.courantMax.some((value) => value !== null)

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mx-auto max-w-[1100px] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[21px] font-bold">Convergence plots</h2>
            <p className="text-[14px] text-muted-foreground">
              {run.isReference ? 'Run 1 · Reference' : run.label}
              {data ? ` · ${data.steps.toLocaleString()} ${steady ? 'iterations' : 'time steps'}` : ''}
              {run.result?.converged ? ' · stopped early: residual targets reached' : ''}
            </p>
          </div>
          {(active || data?.live) && <span className="flex items-center gap-2 text-[14px] text-accent-foreground"><Spinner size={15} /> Updating live</span>}
        </div>
        {error && <div className="panel p-4 text-danger">{error}</div>}
        {!data && !error && <div className="panel flex items-center gap-3 p-6 text-muted-foreground"><Spinner /> Loading convergence history…</div>}
        {data && data.times.length === 0 && (
          <div className="panel p-6 text-muted-foreground">{active ? 'Waiting for the solver to start…' : 'This run stopped before the solver took its first step, so there is nothing to plot. Check the solver log.'}</div>
        )}
        {data && data.times.length > 0 && (
          <>
            <Chart title="Initial residuals" x={data.times} series={residuals} log xLabel={xLabel} yLabel="Initial residual" />
            {hasCourant && (
              <Chart title="Maximum Courant number" x={data.times} series={[{ name: 'Co max', color: '#1976d2', values: data.courantMax }]} log={false} xLabel={xLabel} yLabel="Co max" refLine={{ value: 1, label: 'Co = 1' }} />
            )}
            {data.monitors.map((monitor) => (
              <Chart
                key={monitor.title} title={monitor.title} x={monitor.times} log={false} xLabel={xLabel} yLabel={monitor.yLabel} settled
                series={monitor.series.map((entry, i) => ({ name: entry.label, color: COLORS[(i * 2) % COLORS.length]!, values: entry.values }))}
              />
            ))}
            <p className="px-1 text-[13.5px] leading-relaxed text-muted-foreground">
              {steady
                ? 'Each curve is the initial residual of one equation per iteration. A steady solution is converged when every residual has dropped by several orders of magnitude and levelled off.'
                : 'Each curve is the initial residual of one equation at the start of every time step. In a transient run, residuals fall as the flow settles; persistent spikes point to a time step that is too large.'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
