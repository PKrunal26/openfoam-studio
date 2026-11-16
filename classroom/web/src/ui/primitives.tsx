import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, LoaderCircle, X } from 'lucide-react'
import { useToasts } from '@c/store'

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-[#2a333d] disabled:bg-[#aab2ba]',
  secondary: 'bg-white text-ink border border-input hover:bg-muted disabled:text-[#a3acb5]',
  ghost: 'text-ink hover:bg-[#e9edf0] disabled:text-[#a3acb5]',
  accent: 'bg-accent-strong text-white hover:bg-[#1484b8] disabled:bg-[#a9d3e6]',
  danger: 'bg-white text-danger border border-[#efc2c2] hover:bg-danger-bg',
}

export function Button({ variant = 'secondary', size = 'md', className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-bold whitespace-nowrap transition-colors',
        size === 'sm' ? 'h-8 px-3 text-[13.5px]' : size === 'lg' ? 'h-11 px-5 text-[15.5px]' : 'h-9.5 px-4 text-[14.5px]',
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
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-40',
        active ? 'bg-accent text-accent-foreground ring-1 ring-[#9bd3ec]' : 'text-[#4b5661] hover:bg-[#e9edf0]',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <LoaderCircle size={size} className={cn('cls-spin', className)} aria-hidden />
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'violet'; children: ReactNode }) {
  const tones = {
    neutral: 'bg-[#edf0f3] text-[#4b5661]',
    accent: 'bg-accent text-accent-foreground',
    success: 'bg-[#e4f6ec] text-[#14713e]',
    warning: 'bg-warning-bg text-[#8a5300]',
    danger: 'bg-danger-bg text-[#a32727]',
    violet: 'bg-[#f0e8fd] text-[#6a34b8]',
  }
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12.5px] font-bold', tones[tone])}>{children}</span>
}

export function Notice({ tone, children }: { tone: 'warning' | 'error' | 'info'; children: ReactNode }) {
  const style = tone === 'warning' ? 'bg-warning-bg text-[#7a4a00] border-[#f3d9a4]' : tone === 'error' ? 'bg-danger-bg text-[#8f2020] border-[#f1c4c4]' : 'bg-accent text-[#164b66] border-[#bfe1f1]'
  const Icon = tone === 'info' ? Info : CircleAlert
  return (
    <div className={cn('flex gap-2 rounded-md border px-3 py-2 text-[13.5px] leading-snug', style)}>
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function Toasts() {
  const toasts = useToasts((state) => state.toasts)
  const dismiss = useToasts((state) => state.dismiss)
  return (
    <div className="pointer-events-none fixed bottom-12 left-1/2 z-50 flex w-[min(92vw,520px)] -translate-x-1/2 flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="panel-float pointer-events-auto flex items-start gap-2.5 px-3.5 py-3 text-[14px]">
          {toast.kind === 'success' ? <CircleCheck size={18} className="mt-0.5 shrink-0 text-success" />
            : toast.kind === 'error' ? <CircleAlert size={18} className="mt-0.5 shrink-0 text-danger" />
            : <Info size={18} className="mt-0.5 shrink-0 text-accent-strong" />}
          <div className="min-w-0 flex-1 leading-snug">{toast.text}</div>
          <button type="button" aria-label="Dismiss" className="rounded p-0.5 text-muted-foreground hover:bg-muted" onClick={() => dismiss(toast.id)}>
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  )
}

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="15" fill="#10212e" />
      <path d="M5 13c5-4 10 3 15-1s6-3 8-2M4 18c5-4 11 3 16-1s6-2 9-1M6 23c4-3 9 2 14-1s5-2 7-1" fill="none" stroke="#39b7ea" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

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
