import { useState, type FormEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import { api } from '@c/api'
import { useSession } from '@c/store'
import { navigate } from '@c/router'
import { Button, Notice, Segmented, Spinner, Wordmark } from '@c/ui/primitives'

/** Streamlines parting around a cylinder, quantised into viridis blocks. */
function BlockField() {
  const cols = 44
  const rows = 34
  const cx = 14
  const cy = 17
  const radius = 3.6
  const palette = ['var(--v0)', 'var(--v1)', 'var(--v2)', 'var(--v3)', 'var(--v4)']
  const cells = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const dx = (x + 0.5 - cx) / radius
      const dy = (y + 0.5 - cy) / radius
      const r2 = dx * dx + dy * dy
      if (r2 < 1) { cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1.03" height="1.03" fill="var(--paper)" />); continue }
      // Potential flow past a cylinder: slow at the front and back, fast over the shoulders.
      const u = 1 - (dx * dx - dy * dy) / (r2 * r2)
      const v = (-2 * dx * dy) / (r2 * r2)
      let speed = Math.hypot(u, v)
      // Behind it, a street of alternating slow patches that fades downstream.
      if (dx > 0.6) {
        const lane = 0.75 * Math.sin(dx * 1.25)
        const patch = Math.exp(-((dy - lane) ** 2) / 0.55) * (0.5 + 0.5 * Math.cos(dx * 2.5 + 1.2))
        speed -= 1.05 * patch * Math.exp(-dx / 7.5)
        speed -= 0.55 * Math.exp(-(dy * dy) / 0.5) * Math.exp(-(dx - 1) / 1.6)
      }
      const level = Math.max(0, Math.min(4, Math.floor(speed * 2.35)))
      cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1.03" height="1.03" fill={palette[level]} />)
    }
  }
  return (
    <svg viewBox={`0 0 ${cols} ${rows}`} preserveAspectRatio="xMidYMid slice" shapeRendering="crispEdges" className="h-full w-full" aria-hidden>
      {cells}
    </svg>
  )
}

export function JoinPage() {
  const info = useSession((state) => state.info)!
  const refresh = useSession((state) => state.refresh)
  const [mode, setMode] = useState<'new' | 'returning'>('new')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.join({ mode, name, pin, ...(mode === 'new' ? { code } : {}) })
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const field = 'h-11 w-full border border-line-strong bg-paper px-3 text-[15px] outline-none transition-colors placeholder:text-ink-4 hover:border-ink focus:border-primary focus:ring-1 focus:ring-primary'

  return (
    <div className="grid h-full overflow-auto lg:grid-cols-[minmax(420px,5fr)_7fr]">
      <div className="flex flex-col px-8 py-8 sm:px-14">
        <Wordmark size="lg" />
        <form onSubmit={submit} className="my-auto w-full max-w-[400px] py-10">
          <p className="t-eyebrow">{info.className}</p>
          <h1 className="t-display mt-3 text-[44px]">{mode === 'new' ? 'Join the class' : 'Welcome back'}</h1>
          <p className="mt-3 text-[15px] text-ink-2">Solved OpenFOAM cases you can open, change and run again from your browser.</p>

          <div className="mt-8">
            <Segmented
              label="Account" value={mode} onChange={(value) => { setMode(value); setError(null) }}
              options={[{ value: 'new', label: 'I’m new here' }, { value: 'returning', label: 'I have an account' }]}
            />
          </div>

          <div className="mt-6 space-y-5">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium">Your name</span>
              <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="First and last name" required minLength={2} maxLength={60} autoFocus />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium">{mode === 'new' ? 'Choose a PIN' : 'PIN'}</span>
              <input className={field} type="password" value={pin} onChange={(e) => setPin(e.target.value)} autoComplete={mode === 'new' ? 'new-password' : 'current-password'} placeholder="At least 4 characters" required minLength={4} maxLength={64} />
              {mode === 'new' && <span className="mt-1.5 block text-[12.5px] text-ink-3">Your name and PIN get you back to your work on any device.</span>}
            </label>
            {mode === 'new' && info.requiresClassCode && (
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium">Class code</span>
                <input className={`${field} font-mono placeholder:font-sans`} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" placeholder="From your instructor" required />
              </label>
            )}
          </div>

          {error && <div className="mt-5"><Notice tone="error">{error}</Notice></div>}

          <Button type="submit" variant="primary" size="lg" className="mt-7 w-full justify-between" disabled={busy}>
            {mode === 'new' ? 'Create account and start' : 'Sign in'}
            {busy ? <Spinner /> : <ArrowRight size={18} />}
          </Button>
        </form>
        <div className="flex items-center justify-between text-[12.5px] text-ink-3">
          <span className="font-mono">OpenFOAM 13</span>
          {info.instructorEnabled && <button type="button" className="underline-offset-4 hover:text-ink hover:underline" onClick={() => navigate('/admin')}>Instructor sign-in</button>}
        </div>
      </div>

      <div className="relative hidden overflow-hidden bg-v0 lg:block">
        <BlockField />
        <div className="absolute bottom-0 left-0 bg-paper px-6 py-4">
          <p className="t-eyebrow">Velocity magnitude</p>
          <p className="mt-1 text-[13px] text-ink-2">Flow around a cylinder, Re = 100. Tutorial 05.</p>
        </div>
      </div>
    </div>
  )
}
