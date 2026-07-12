import { Pause, Play, SkipBack, SkipForward, StepBack, StepForward } from 'lucide-react'
import { useResultsStore } from '@/store/useResultsStore'
import { Select } from '@/components/ui/select'

const SPEEDS = [0.5, 1, 2, 5, 10]

function formatTime(t: number): string {
  // Times can be fractional (0.5 s) or tiny (1e-05 s) — keep them readable.
  if (t !== 0 && (Math.abs(t) < 0.001 || Math.abs(t) >= 100000)) return t.toExponential(2)
  return String(Math.round(t * 1e6) / 1e6)
}

const btnCls =
  'flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30'

export function TimeTransport({ times }: { times: number[] }) {
  const timeIndex = useResultsStore((s) => s.timeIndex)
  const playing = useResultsStore((s) => s.playing)
  const speed = useResultsStore((s) => s.speed)
  const setTimeIndex = useResultsStore((s) => s.setTimeIndex)
  const setPlaying = useResultsStore((s) => s.setPlaying)
  const setSpeed = useResultsStore((s) => s.setSpeed)

  const max = times.length - 1
  const index = Math.min(timeIndex, Math.max(max, 0))
  const disabled = times.length < 2

  return (
    <div className="flex items-center gap-2 border-t px-3 py-1.5">
      <div className="flex items-center gap-0.5">
        <button type="button" title="First step" className={btnCls} disabled={disabled} onClick={() => setTimeIndex(0)}>
          <SkipBack className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="Previous step" className={btnCls} disabled={disabled} onClick={() => setTimeIndex(Math.max(0, index - 1))}>
          <StepBack className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title={playing ? 'Pause' : 'Play'}
          className={btnCls}
          disabled={disabled}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <button type="button" title="Next step" className={btnCls} disabled={disabled} onClick={() => setTimeIndex(Math.min(max, index + 1))}>
          <StepForward className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="Last step" className={btnCls} disabled={disabled} onClick={() => setTimeIndex(max)}>
          <SkipForward className="h-3.5 w-3.5" />
        </button>
      </div>

      <input
        type="range"
        min={0}
        max={Math.max(max, 0)}
        step={1}
        value={index}
        disabled={disabled}
        onChange={(e) => setTimeIndex(Number(e.target.value))}
        className="ofs-slider min-w-0 flex-1"
        style={{ ['--pct' as string]: `${max > 0 ? (index / max) * 100 : 0}%` }}
      />

      <span className="w-32 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
        t = {times.length ? formatTime(times[index]!) : '—'} s · {times.length ? index + 1 : 0}/{times.length}
      </span>

      <Select
        title="Playback speed (steps per second)"
        size="sm"
        className="w-16 shrink-0"
        value={String(speed)}
        onChange={(v) => setSpeed(Number(v))}
        disabled={disabled}
      >
        {SPEEDS.map((s) => (
          <option key={s} value={String(s)}>
            {s}×
          </option>
        ))}
      </Select>
    </div>
  )
}
