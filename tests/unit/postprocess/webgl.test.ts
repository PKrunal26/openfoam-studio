import { describe, it, expect, vi } from 'vitest'
import {
  getRenderingCanvas,
  hasUsable3DContext,
  attachContextLossListeners,
} from '../../../renderer/lib/vtk/webgl'

// A minimal stand-in for a GenericRenderWindow that lets each test control what
// getApiSpecificRenderWindow / getCanvas / get3DContext return.
function fakeGrw(opts: {
  canvas?: unknown
  context?: unknown
  throwOnContext?: boolean
  noApi?: boolean
}) {
  const api = {
    getCanvas: () => opts.canvas,
    get3DContext: () => {
      if (opts.throwOnContext) {
        // Mirrors the real vtk.js bug: `new Proxy(null, ...)` throws a
        // TypeError when no WebGL context is available.
        throw new TypeError('Cannot create proxy with a non-object as target or handler')
      }
      return opts.context
    },
  }
  return {
    getApiSpecificRenderWindow: () => (opts.noApi ? undefined : api),
  }
}

function fakeCanvas() {
  const listeners: Record<string, EventListenerOrEventListenerObject[]> = {}
  return {
    getContext: () => ({}),
    addEventListener: vi.fn((type: string, cb: EventListenerOrEventListenerObject) => {
      ;(listeners[type] ??= []).push(cb)
    }),
    removeEventListener: vi.fn((type: string, cb: EventListenerOrEventListenerObject) => {
      listeners[type] = (listeners[type] ?? []).filter((l) => l !== cb)
    }),
    _emit(type: string, event: unknown) {
      for (const l of listeners[type] ?? []) (l as EventListener)(event as Event)
    },
    _count(type: string) {
      return (listeners[type] ?? []).length
    },
  }
}

describe('getRenderingCanvas', () => {
  it('returns the canvas exposed by the api-specific render window', () => {
    const canvas = fakeCanvas()
    expect(getRenderingCanvas(fakeGrw({ canvas }))).toBe(canvas)
  })

  it('returns null when there is no api-specific render window', () => {
    expect(getRenderingCanvas(fakeGrw({ noApi: true }))).toBeNull()
  })

  it('returns null when the canvas is not a usable element', () => {
    expect(getRenderingCanvas(fakeGrw({ canvas: undefined }))).toBeNull()
  })

  it('returns null instead of throwing when grw is null', () => {
    expect(getRenderingCanvas(null)).toBeNull()
  })
})

describe('hasUsable3DContext', () => {
  it('is true when get3DContext returns a context object', () => {
    expect(hasUsable3DContext(fakeGrw({ context: {} }))).toBe(true)
  })

  it('is false when get3DContext returns null', () => {
    expect(hasUsable3DContext(fakeGrw({ context: null }))).toBe(false)
  })

  it('is false (never throws) when get3DContext throws the Proxy TypeError', () => {
    expect(hasUsable3DContext(fakeGrw({ throwOnContext: true }))).toBe(false)
  })

  it('is false when grw is null', () => {
    expect(hasUsable3DContext(null)).toBe(false)
  })
})

describe('attachContextLossListeners', () => {
  it('registers lost/restored listeners and detaches them on cleanup', () => {
    const canvas = fakeCanvas()
    const detach = attachContextLossListeners(canvas as never, {
      onLost: () => {},
      onRestored: () => {},
    })
    expect(canvas._count('webglcontextlost')).toBe(1)
    expect(canvas._count('webglcontextrestored')).toBe(1)
    detach()
    expect(canvas._count('webglcontextlost')).toBe(0)
    expect(canvas._count('webglcontextrestored')).toBe(0)
  })

  it('calls onLost and preventDefault when the context is lost', () => {
    const canvas = fakeCanvas()
    const onLost = vi.fn()
    attachContextLossListeners(canvas as never, { onLost, onRestored: () => {} })
    const preventDefault = vi.fn()
    canvas._emit('webglcontextlost', { preventDefault })
    expect(onLost).toHaveBeenCalledOnce()
    // preventDefault is required for the browser to later fire contextrestored.
    expect(preventDefault).toHaveBeenCalledOnce()
  })

  it('calls onRestored when the context is restored', () => {
    const canvas = fakeCanvas()
    const onRestored = vi.fn()
    attachContextLossListeners(canvas as never, { onLost: () => {}, onRestored })
    canvas._emit('webglcontextrestored', {})
    expect(onRestored).toHaveBeenCalledOnce()
  })

  it('is a no-op (returns a safe detach) when canvas is null', () => {
    const detach = attachContextLossListeners(null, { onLost: () => {}, onRestored: () => {} })
    expect(() => detach()).not.toThrow()
  })
})
