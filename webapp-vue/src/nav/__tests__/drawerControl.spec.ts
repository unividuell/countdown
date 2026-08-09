import { describe, expect, it, vi } from 'vitest'
import { onDrawerCloseRequested, requestDrawerClose } from '@/nav/drawerControl'

describe('drawerControl', () => {
  it('calls every current listener', () => {
    const a = vi.fn()
    const b = vi.fn()
    const offA = onDrawerCloseRequested(a)
    const offB = onDrawerCloseRequested(b)

    requestDrawerClose()

    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    offA()
    offB()
  })

  it('stops calling a listener once it unsubscribes', () => {
    // The set is module-level and lives as long as the tab: a subscription that survived its
    // component would be called for every page action for the rest of the session.
    const listener = vi.fn()
    const off = onDrawerCloseRequested(listener)
    off()

    requestDrawerClose()

    expect(listener).not.toHaveBeenCalled()
  })

  it('still reaches the rest when a listener unsubscribes itself while closing', () => {
    // A close that unmounts the subscriber is the ordinary case, not an exotic one — the
    // listeners after it must still run. Pinned so the iteration cannot be swapped for an
    // index-based walk, where removing the current entry skips the next.
    let offFirst: (() => void) | null = null
    offFirst = onDrawerCloseRequested(() => offFirst?.())
    const later = vi.fn()
    const offLater = onDrawerCloseRequested(later)

    requestDrawerClose()

    expect(later).toHaveBeenCalledTimes(1)
    offLater()
  })
})
