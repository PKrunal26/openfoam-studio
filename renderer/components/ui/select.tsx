import { Children, isValidElement, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Custom dropdown that replaces native <select> everywhere — including the
 * open menu, which the OS draws for real selects and cannot be themed.
 *
 * Accepts plain <option> children (same call-site shape as a native select);
 * they are parsed into items and rendered in a portal-positioned listbox.
 */

interface Item {
  value: string
  label: string
}

function itemsFromChildren(children: React.ReactNode): Item[] {
  const items: Item[] = []
  const walk = (node: React.ReactNode) => {
    Children.forEach(node, (child) => {
      if (!isValidElement(child)) return
      if (child.type === 'option') {
        const props = child.props as { value?: unknown; children?: React.ReactNode }
        items.push({
          value: String(props.value ?? ''),
          label: typeof props.children === 'string' ? props.children : flattenText(props.children),
        })
      } else {
        walk((child.props as { children?: React.ReactNode }).children)
      }
    })
  }
  walk(children)
  return items
}

function flattenText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join('')
  if (isValidElement(node)) return flattenText((node.props as { children?: React.ReactNode }).children)
  return ''
}

export function Select({
  value,
  onChange,
  title,
  disabled,
  size = 'md',
  className,
  children,
}: {
  value: string
  onChange: (v: string) => void
  title?: string
  disabled?: boolean
  size?: 'sm' | 'md'
  className?: string
  children: React.ReactNode
}) {
  const items = itemsFromChildren(children)
  const selected = items.find((i) => i.value === value)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean }>({
    top: 0, left: 0, width: 0, up: false,
  })

  const openMenu = () => {
    if (disabled) return
    setActive(Math.max(0, items.findIndex((i) => i.value === value)))
    setOpen(true)
  }

  // Position the portal listbox against the trigger; flip up near the bottom.
  useLayoutEffect(() => {
    if (!open) return
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const menuHeight = Math.min(items.length * 26 + 8, 240)
    const up = r.bottom + menuHeight + 8 > window.innerHeight && r.top > menuHeight
    setPos({
      top: up ? r.top - menuHeight - 4 : r.bottom + 4,
      left: Math.min(r.left, window.innerWidth - Math.max(r.width, 140) - 8),
      width: Math.max(r.width, 140),
      up,
    })
  }, [open, items.length])

  // Close on outside click / scroll / resize.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return
      if (listRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onScroll = (e: Event) => {
      if (listRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  // Keep the active row visible while navigating with arrows.
  useEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const commit = (i: number) => {
    const item = items[i]
    if (item) onChange(item.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        openMenu()
      }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(items.length - 1) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commit(active) }
    else if (e.key === 'Tab') { setOpen(false) }
  }

  return (
    <div className={cn('relative min-w-0', className)}>
      <button
        ref={triggerRef}
        type="button"
        title={title}
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={cn(
          'flex w-full min-w-0 cursor-pointer items-center justify-between gap-1 rounded-md border border-border/80 bg-background text-left text-foreground outline-none transition-colors',
          'hover:border-border focus:border-ring focus:ring-1 focus:ring-ring/30',
          'disabled:cursor-not-allowed disabled:opacity-40',
          size === 'sm' ? 'h-6 pl-1.5 pr-1 text-[11px]' : 'h-8 pl-2.5 pr-1.5 text-sm',
        )}
      >
        <span className="truncate">{selected?.label ?? value ?? ''}</span>
        <ChevronDown
          className={cn(
            'shrink-0 text-muted-foreground transition-transform',
            size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5',
            open && 'rotate-180',
          )}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={listRef}
            role="listbox"
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 100 }}
            className="max-h-60 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
          >
            {items.map((item, i) => {
              const isSelected = item.value === value
              return (
                <div
                  key={`${item.value}-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  data-index={i}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => { e.preventDefault(); commit(i) }}
                  className={cn(
                    'flex cursor-pointer items-center gap-1.5 rounded-[5px] px-2 py-1 text-xs',
                    i === active ? 'bg-accent text-accent-foreground' : 'text-foreground/85',
                  )}
                >
                  <Check className={cn('h-3 w-3 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{item.label}</span>
                </div>
              )
            })}
          </div>,
          document.body,
        )}
    </div>
  )
}
