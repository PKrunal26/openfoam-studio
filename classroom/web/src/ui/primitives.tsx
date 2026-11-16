import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, LoaderCircle, X } from 'lucide-react'
import { useToasts } from '@c/store'

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

// ── Identity ─────────────────────────────────────────────────────────────────

const VIRIDIS = ['var(--v0)', 'var(--v1)', 'var(--v2)', 'var(--v3)', 'var(--v4)']

/** The five-step viridis band: the one recurring brand device. */
export function ViridisBand({ className, reverse }: { className?: string; reverse?: boolean }) {
  const colors = reverse ? [...VIRIDIS].reverse() : VIRIDIS
  return (
    <div className={cn('flex', className)} aria-hidden>
      {colors.map((color) => <span key={color} className="h-full flex-1" style={{ background: color }} />)}
    </div>
  )
}

/** Logo mark: a streamline bending around an obstacle, drawn in blocks. */
export function Mark({ size = 28 }: { size?: number }) {
  const cells: [number, number, string][] = [
    [0, 0, 'var(--v0)'], [1, 0, 'var(--v0)'],
    [1, 1, 'var(--v1)'], [2, 1, 'var(--v1)'],
    [2, 2, 'var(--v2)'], [3, 2, 'var(--v2)'],
    [1, 3, 'var(--v3)'], [2, 3, 'var(--v3)'],
  ]
  return (
    <svg width={size} height={size} viewBox="0 0 4 4" shapeRendering="crispEdges" aria-hidden>
      {cells.map(([x, y, fill]) => <rect key={`${x}${y}`} x={x} y={y} width="1" height="1" fill={fill} />)}
    </svg>
  )
}

export function Wordmark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className="flex items-center gap-2.5">
      <Mark size={size === 'lg' ? 34 : 26} />
      <span className={cn('t-title whitespace-nowrap', size === 'lg' ? 'text-[21px]' : 'text-[16.5px]')}>
        OpenFOAM Studio <span className="font-normal text-ink-3">Classroom</span>
      </span>
    </span>
  )
}

/** Level as filled blocks, e.g. difficulty 2 of 3. */
export function Blocks({ value, max = 3, label }: { value: number; max?: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-[3px]" role="img" aria-label={label} title={label}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className="h-2.5 w-2.5" style={{ background: i < value ? VIRIDIS[Math.min(4, i + 1)] : 'var(--wash-2)' }} />
      ))}
    </span>
  )
}

// ── Buttons ──────────────────────────────────────────────────────────────────

type Variant = 'primary' | 'ink' | 'outline' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover disabled:bg-wash-2 disabled:text-ink-4',
  ink: 'bg-ink text-white hover:bg-[#263238] disabled:bg-wash-2 disabled:text-ink-4',
  outline: 'bg-paper text-ink border border-line-strong hover:border-ink disabled:text-ink-4 disabled:hover:border-line-strong',
  ghost: 'text-ink-2 hover:bg-wash hover:text-ink disabled:text-ink-4 disabled:hover:bg-transparent',
  danger: 'bg-paper text-bad border border-line-strong hover:border-bad',
}

export function Button({ variant = 'outline', size = 'md', className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 font-medium whitespace-nowrap transition-colors',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : size === 'lg' ? 'h-11 px-5 text-[15px]' : 'h-9 px-3.5 text-[13.5px]',
        VARIANTS[variant], className,
      )}
    >
      {children}
    </button>
  )
}

export function IconButton({ label, active, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button" aria-label={label} title={label} {...rest}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center transition-colors disabled:opacity-40',
        active ? 'bg-ink text-white' : 'text-ink-2 hover:bg-wash hover:text-ink', className,
      )}
    >
      {children}
    </button>
  )
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <LoaderCircle size={size} className={cn('cls-spin', className)} aria-hidden />
}

// ── Small labels ─────────────────────────────────────────────────────────────

export function Tag({ tone = 'neutral', children }: { tone?: 'neutral' | 'primary' | 'ok' | 'warn' | 'bad' | 'ink'; children: ReactNode }) {
  const tones = {
    neutral: 'bg-wash text-ink-2',
    primary: 'bg-primary-tint text-primary-ink',
    ok: 'bg-[#e4f4ea] text-[#1c6b39]',
    warn: 'bg-warn-tint text-warn',
    bad: 'bg-bad-tint text-bad',
    ink: 'bg-ink text-white',
  }
  return <span className={cn('inline-flex h-5 items-center px-1.5 font-mono text-[10.5px] font-medium tracking-[0.06em] whitespace-nowrap uppercase', tones[tone])}>{children}</span>
}

export function Notice({ tone, children }: { tone: 'warning' | 'error' | 'info'; children: ReactNode }) {
  const style = tone === 'warning' ? 'border-warn bg-warn-tint text-[#6f4705]' : tone === 'error' ? 'border-bad bg-bad-tint text-[#8c241c]' : 'border-v2 bg-primary-tint text-primary-ink'
  return <div className={cn('border-l-[3px] px-3 py-2 text-[13px] leading-snug', style)} role={tone === 'error' ? 'alert' : 'note'}>{children}</div>
}

export function Toasts() {
  const toasts = useToasts((state) => state.toasts)
  const dismiss = useToasts((state) => state.dismiss)
  return (
    <div className="pointer-events-none fixed bottom-10 left-1/2 z-50 flex w-[min(92vw,480px)] -translate-x-1/2 flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="pop cls-pop-in pointer-events-auto flex items-start gap-3 py-2.5 pl-0 pr-2 text-[13.5px]">
          <span className="w-[3px] self-stretch" style={{ background: toast.kind === 'success' ? 'var(--ok)' : toast.kind === 'error' ? 'var(--bad)' : 'var(--v2)' }} />
          <div className="min-w-0 flex-1 py-0.5 leading-snug">{toast.text}</div>
          <button type="button" aria-label="Dismiss" className="p-1 text-ink-3 hover:bg-wash hover:text-ink" onClick={() => dismiss(toast.id)}><X size={14} /></button>
        </div>
      ))}
    </div>
  )
}

// ── Form controls ────────────────────────────────────────────────────────────

export interface SelectOption { value: string; label: string; hint?: string }

/**
 * Listbox select. The menu is portalled and positioned from the trigger so it
 * is never clipped by a scrolling panel. Keyboard: arrows, Home/End, Enter,
 * Escape, and typing a letter jumps to the next match.
 */
export function Select({ value, options, onChange, label, className, disabled }: {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  label: string
  className?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [rect, setRect] = useState<{ left: number; top: number; width: number; up: boolean; maxHeight: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const id = useId()
  const selected = options.find((option) => option.value === value)

  const place = () => {
    const box = triggerRef.current?.getBoundingClientRect()
    if (!box) return
    const below = window.innerHeight - box.bottom - 12
    const above = box.top - 12
    const wanted = Math.min(320, options.length * 36 + 8)
    const up = below < Math.min(wanted, 160) && above > below
    setRect({ left: box.left, top: up ? box.top : box.bottom, width: box.width, up, maxHeight: Math.max(120, Math.min(wanted, up ? above : below)) })
  }

  useLayoutEffect(() => {
    if (!open) return
    place()
    setActive(Math.max(0, options.findIndex((option) => option.value === value)))
    const close = (event: Event) => {
      if (event.type === 'scroll' && listRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => { window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (open) listRef.current?.focus()
  }, [open, rect])

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const choose = (index: number) => {
    const option = options[index]
    if (option && option.value !== value) onChange(option.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const onListKey = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(options.length - 1, i + 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
    else if (event.key === 'Home') { event.preventDefault(); setActive(0) }
    else if (event.key === 'End') { event.preventDefault(); setActive(options.length - 1) }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(active) }
    else if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); setOpen(false); triggerRef.current?.focus() }
    else if (event.key.length === 1) {
      const letter = event.key.toLowerCase()
      const next = [...options.keys()].map((i) => (i + active + 1) % options.length).find((i) => options[i]!.label.toLowerCase().startsWith(letter))
      if (next !== undefined) setActive(next)
    }
  }

  return (
    <>
      <button
        ref={triggerRef} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-label={label} aria-controls={open ? id : undefined}
        className={cn(
          'flex h-9 w-full items-center gap-2 border bg-paper pl-2.5 pr-2 text-left text-[13.5px] transition-colors disabled:opacity-50',
          open ? 'border-primary' : 'border-line-strong hover:border-ink', className,
        )}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true) } }}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? value}</span>
        <ChevronDown size={15} className={cn('shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onMouseDown={() => setOpen(false)} />
          <ul
            ref={listRef} id={id} role="listbox" tabIndex={-1} aria-label={label} aria-activedescendant={`${id}-${active}`}
            className="pop cls-pop-in fixed z-[61] overflow-y-auto py-1 outline-none"
            style={{ left: rect.left, width: Math.max(rect.width, 180), maxHeight: rect.maxHeight, ...(rect.up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.top + 4 }) }}
            onKeyDown={onListKey}
          >
            {options.map((option, index) => (
              <li
                key={option.value} id={`${id}-${index}`} data-index={index} role="option" aria-selected={option.value === value}
                className={cn('flex min-h-9 cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[13.5px]', index === active ? 'bg-wash' : '', option.value === value && 'font-medium')}
                onMouseEnter={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)}
              >
                <span className="flex w-4 shrink-0 justify-center text-primary">{option.value === value && <Check size={14} strokeWidth={2.5} />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block">{option.label}</span>
                  {option.hint && <span className="block text-[12px] font-normal text-ink-3">{option.hint}</span>}
                </span>
              </li>
            ))}
          </ul>
        </>,
        document.body,
      )}
    </>
  )
}

/** A short row of mutually exclusive choices. */
export function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div className="flex border border-line-strong" role="radiogroup" aria-label={label}>
      {options.map((option, index) => (
        <button
          key={String(option.value)} type="button" role="radio" aria-checked={option.value === value}
          className={cn('h-8 min-w-0 px-2 text-[13px] whitespace-nowrap transition-colors', index > 0 && 'border-l border-line-strong', option.value === value ? 'bg-ink font-medium text-white' : 'bg-paper text-ink-2 hover:bg-wash')}
          style={{ flex: `${Math.max(3, option.label.length)} 1 0` }}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={cn('flex h-9 cursor-pointer items-center justify-between gap-3 text-[13.5px]', disabled && 'cursor-not-allowed opacity-45')}>
      <span>{label}</span>
      <button
        type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
        className={cn('relative h-[18px] w-8 shrink-0 transition-colors', checked ? 'bg-primary' : 'bg-line-strong')}
      >
        <span className={cn('absolute top-[3px] h-3 w-3 bg-white transition-[left]', checked ? 'left-[17px]' : 'left-[3px]')} />
      </button>
    </label>
  )
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function formatNumber(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return '–'
  if (value === 0) return '0'
  const magnitude = Math.abs(value)
  if (magnitude >= 1e5 || magnitude < 1e-3) return value.toExponential(Math.max(0, digits - 1)).replace(/\.?0+e/, 'e').replace('e+', 'e')
  return String(Number(value.toPrecision(digits)))
}

export function formatDuration(ms: number): string {
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s`
  return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`
}

export function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`
  return `${Math.floor(seconds / 86400)} d ago`
}

/** Two-digit index, as printed on tutorial cards and breadcrumbs. */
export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
