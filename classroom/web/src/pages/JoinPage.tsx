import { useState, type FormEvent } from 'react'
import { ArrowRight, CircleCheck } from 'lucide-react'
import { api } from '@c/api'
import { useSession } from '@c/store'
import { navigate } from '@c/router'
import { Button, Logo, Notice, Spinner, cn } from '@c/ui/primitives'

function FlowArt() {
  // Decorative streamlines around a cylinder.
  const lines = Array.from({ length: 13 }, (_, i) => {
    const y = 40 + i * 30
    const d = (y - 220) / 180
    const bulge = 78 * Math.exp(-d * d * 3.2) * Math.sign(d || 1)
    return `M-20 ${y} C 180 ${y}, 250 ${y + bulge}, 330 ${y + bulge} S 480 ${y}, 720 ${y + (i % 2 ? 9 : -9)}`
  })
  return (
    <svg viewBox="0 0 700 440" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="flow" x1="0" x2="1">
          <stop offset="0" stopColor="#39b7ea" stopOpacity="0.05" />
          <stop offset="0.45" stopColor="#39b7ea" stopOpacity="0.55" />
          <stop offset="1" stopColor="#7fe0c4" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      {lines.map((d, i) => <path key={i} d={d} fill="none" stroke="url(#flow)" strokeWidth={i % 3 === 0 ? 2.2 : 1.3} />)}
      <circle cx="330" cy="220" r="44" fill="#16303f" stroke="#39b7ea" strokeOpacity="0.5" />
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

  const field = 'h-11 w-full rounded-md border border-input bg-white px-3 text-[15.5px] outline-none focus:border-accent-strong focus:ring-2 focus:ring-[#bfe3f3]'

  return (
    <div className="grid h-full overflow-auto lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-[#0e1c27] text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <FlowArt />
        <div className="relative flex items-center gap-3">
          <Logo size={40} />
          <div className="text-[19px] font-black tracking-tight">OpenFOAM Studio <span className="font-normal text-[#8fd6f5]">Classroom</span></div>
        </div>
        <div className="relative max-w-[520px]">
          <h1 className="text-[40px] leading-[1.1] font-black tracking-tight text-balance">Learn CFD on solved OpenFOAM cases.</h1>
          <ul className="mt-7 space-y-3 text-[16.5px] text-[#cfe3ee]">
            {[
              'Every tutorial opens with its results already computed.',
              'Change a boundary condition, the mesh or a scheme and re-run in your browser.',
              'See the real OpenFOAM dictionaries behind every setting.',
            ].map((line) => (
              <li key={line} className="flex gap-3"><CircleCheck size={20} className="mt-0.5 shrink-0 text-[#57c9a0]" />{line}</li>
            ))}
          </ul>
        </div>
        <div className="relative text-[13.5px] text-[#8aa3b3]">OpenFOAM 13 · runs on your course server</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-[420px]">
          <div className="mb-7 flex items-center gap-3 lg:hidden"><Logo /><span className="text-[18px] font-black">OpenFOAM Studio Classroom</span></div>
          <p className="text-[13.5px] font-bold tracking-wide text-accent-foreground uppercase">{info.className}</p>
          <h2 className="mt-1 text-[28px] font-black tracking-tight">{mode === 'new' ? 'Join the class' : 'Welcome back'}</h2>

          <div className="mt-6 grid grid-cols-2 rounded-lg bg-[#e6eaee] p-1 text-[14.5px] font-bold" role="tablist">
            {(['new', 'returning'] as const).map((value) => (
              <button
                key={value} type="button" role="tab" aria-selected={mode === value}
                className={cn('h-9 rounded-md transition-colors', mode === value ? 'bg-white text-ink shadow-sm' : 'text-[#5d6975] hover:text-ink')}
                onClick={() => { setMode(value); setError(null) }}
              >
                {value === 'new' ? 'I’m new here' : 'I already have an account'}
              </button>
            ))}
          </div>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[14px] font-bold">Your name</span>
              <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="First and last name" required minLength={2} maxLength={60} autoFocus />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[14px] font-bold">{mode === 'new' ? 'Choose a PIN' : 'PIN'}</span>
              <input className={field} type="password" value={pin} onChange={(e) => setPin(e.target.value)} autoComplete={mode === 'new' ? 'new-password' : 'current-password'} placeholder="At least 4 characters" required minLength={4} maxLength={64} />
              {mode === 'new' && <span className="mt-1.5 block text-[13px] text-muted-foreground">You need your name and PIN to get back to your work on another device.</span>}
            </label>
            {mode === 'new' && info.requiresClassCode && (
              <label className="block">
                <span className="mb-1.5 block text-[14px] font-bold">Class code</span>
                <input className={field} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" placeholder="From your instructor" required />
              </label>
            )}
          </div>

          {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}

          <Button type="submit" variant="primary" size="lg" className="mt-6 w-full" disabled={busy}>
            {busy ? <Spinner /> : null}
            {mode === 'new' ? 'Create account and start' : 'Sign in'}
            {!busy && <ArrowRight size={18} />}
          </Button>

          {info.instructorEnabled && (
            <button type="button" className="mt-6 block w-full text-center text-[13.5px] text-muted-foreground hover:text-ink hover:underline" onClick={() => navigate('/admin')}>
              Instructor sign-in
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
