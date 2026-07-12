import { useEffect, useMemo, useRef, useState } from 'react'
import type { ResidualPoint } from '@/store/useRunsStore'

interface Props {
  residuals: ResidualPoint[]
  height?: number
}

const FIELD_COLORS: Record<string, string> = {
  Ux: '#60a5fa', // blue-400
  Uy: '#34d399', // emerald-400
  Uz: '#fbbf24', // amber-400
  p: '#f472b6', // pink-400
  k: '#a78bfa', // violet-400
  epsilon: '#fb7185', // rose-400
  omega: '#22d3ee', // cyan-400
}

const FALLBACK_COLOR = '#94a3b8' // slate-400

function colorFor(field: string): string {
  return FIELD_COLORS[field] ?? FALLBACK_COLOR
}

interface Series {
  field: string
  points: { it: number; v: number }[]
}

export function ResidualChart({ residuals, height = 180 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setWidth(el.clientWidth || 800)
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const series = useMemo<Series[]>(() => {
    const byField = new Map<string, { it: number; v: number }[]>()
    for (const r of residuals) {
      if (!Number.isFinite(r.value) || r.value <= 0) continue
      let arr = byField.get(r.field)
      if (!arr) {
        arr = []
        byField.set(r.field, arr)
      }
      arr.push({ it: r.iteration, v: r.value })
    }
    return [...byField.entries()].map(([field, points]) => ({ field, points }))
  }, [residuals])

  const stats = useMemo(() => {
    let minIt = Infinity
    let maxIt = -Infinity
    let minLog = Infinity
    let maxLog = -Infinity
    for (const s of series) {
      for (const p of s.points) {
        if (p.it < minIt) minIt = p.it
        if (p.it > maxIt) maxIt = p.it
        const lv = Math.log10(p.v)
        if (lv < minLog) minLog = lv
        if (lv > maxLog) maxLog = lv
      }
    }
    if (!Number.isFinite(minIt)) {
      minIt = 0
      maxIt = 1
      minLog = -6
      maxLog = 0
    }
    if (minLog === maxLog) {
      minLog -= 1
      maxLog += 1
    }
    if (minIt === maxIt) maxIt = minIt + 1
    return { minIt, maxIt, minLog, maxLog }
  }, [series])

  const W = width
  const H = height

  if (residuals.length === 0) {
    return (
      <div
        ref={containerRef}
        className="flex w-full items-center justify-center rounded-md border bg-muted/10 text-[11px] text-muted-foreground"
        style={{ height }}
      >
        No residuals yet — they'll plot live as the solver runs.
      </div>
    )
  }
  const PAD_L = 44
  const PAD_R = 90
  const PAD_T = 8
  const PAD_B = 22
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B

  const xOf = (it: number) =>
    PAD_L + ((it - stats.minIt) / (stats.maxIt - stats.minIt)) * innerW
  const yOf = (logV: number) =>
    PAD_T + ((stats.maxLog - logV) / (stats.maxLog - stats.minLog)) * innerH

  const tickLogs: number[] = []
  for (let l = Math.ceil(stats.maxLog); l >= Math.floor(stats.minLog); l--) {
    tickLogs.push(l)
  }

  return (
    <div ref={containerRef} className="w-full" style={{ height }}>
      <svg
        width={W}
        height={H}
        className="block"
      >
      {/* gridlines */}
      {tickLogs.map((l) => (
        <g key={l}>
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={yOf(l)}
            y2={yOf(l)}
            stroke="oklch(0.27 0 0)"
            strokeWidth={1}
          />
          <text
            x={PAD_L - 6}
            y={yOf(l) + 3}
            fontSize={9}
            textAnchor="end"
            fill="oklch(0.6 0 0)"
            fontFamily="ui-monospace, monospace"
          >
            10{l < 0 ? '⁻' : ''}
            {Math.abs(l)}
          </text>
        </g>
      ))}

      {/* axes */}
      <line
        x1={PAD_L}
        x2={W - PAD_R}
        y1={H - PAD_B}
        y2={H - PAD_B}
        stroke="oklch(0.4 0 0)"
        strokeWidth={1}
      />
      <line
        x1={PAD_L}
        x2={PAD_L}
        y1={PAD_T}
        y2={H - PAD_B}
        stroke="oklch(0.4 0 0)"
        strokeWidth={1}
      />
      <text
        x={PAD_L}
        y={H - 6}
        fontSize={9}
        fill="oklch(0.6 0 0)"
        fontFamily="ui-monospace, monospace"
      >
        iter {stats.minIt}
      </text>
      <text
        x={W - PAD_R}
        y={H - 6}
        fontSize={9}
        textAnchor="end"
        fill="oklch(0.6 0 0)"
        fontFamily="ui-monospace, monospace"
      >
        {stats.maxIt}
      </text>

      {/* series lines */}
      {series.map((s) => {
        const d = s.points
          .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.it).toFixed(1)},${yOf(Math.log10(p.v)).toFixed(1)}`)
          .join(' ')
        return (
          <path
            key={s.field}
            d={d}
            fill="none"
            stroke={colorFor(s.field)}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )
      })}

      {/* legend */}
      {series.map((s, i) => {
        const last = s.points[s.points.length - 1]
        return (
          <g key={s.field}>
            <circle cx={W - PAD_R + 12} cy={PAD_T + 8 + i * 14} r={3} fill={colorFor(s.field)} />
            <text
              x={W - PAD_R + 20}
              y={PAD_T + 11 + i * 14}
              fontSize={10}
              fill="oklch(0.85 0 0)"
              fontFamily="ui-monospace, monospace"
            >
              {s.field}
            </text>
            {last && (
              <text
                x={W - PAD_R + 20}
                y={PAD_T + 22 + i * 14}
                fontSize={8}
                fill="oklch(0.6 0 0)"
                fontFamily="ui-monospace, monospace"
              >
                {last.v.toExponential(1)}
              </text>
            )}
          </g>
        )
      })}
      </svg>
    </div>
  )
}
