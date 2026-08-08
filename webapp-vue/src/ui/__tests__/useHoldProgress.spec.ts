import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { useHoldProgress } from '@/ui/useHoldProgress'

/**
 * The composable registers a `visibilitychange` listener through VueUse, which needs an effect
 * scope — so it is exercised inside a throwaway component rather than called bare.
 */
function mountHold(durationMs = 1000) {
  const onComplete = vi.fn()
  let api!: ReturnType<typeof useHoldProgress>
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useHoldProgress(durationMs, onComplete)
        return () => h('div')
      },
    }),
  )
  return { api, onComplete, wrapper }
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
}

describe('useHoldProgress', () => {
  beforeEach(() => {
    // rAF is what drives the loop; the default fake set does not cover it.
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    setHidden(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    setHidden(false)
  })

  it('starts at rest', () => {
    const { api } = mountHold()

    expect(api.progress.value).toBe(0)
    expect(api.holding.value).toBe(false)
  })

  it('fills while held and completes exactly once', () => {
    const { api, onComplete } = mountHold(1000)

    api.start()
    vi.advanceTimersByTime(500)
    expect(api.progress.value).toBeGreaterThan(0.3)
    expect(api.progress.value).toBeLessThan(1)
    expect(onComplete).not.toHaveBeenCalled()

    vi.advanceTimersByTime(700)
    expect(api.progress.value).toBe(1)
    expect(api.holding.value).toBe(false)
    expect(onComplete).toHaveBeenCalledTimes(1)

    // The loop is stopped, not merely idle — no second completion can arrive later.
    vi.advanceTimersByTime(5000)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('runs back down when released early and never completes', () => {
    const { api, onComplete } = mountHold(1000)

    api.start()
    vi.advanceTimersByTime(400)
    const peak = api.progress.value
    api.cancel()
    vi.advanceTimersByTime(100)

    expect(api.progress.value).toBeLessThan(peak)
    vi.advanceTimersByTime(2000)
    expect(api.progress.value).toBe(0)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('starts a fresh attempt after a completed one', () => {
    const { api, onComplete } = mountHold(1000)

    api.start()
    vi.advanceTimersByTime(1200)
    expect(api.progress.value).toBe(1)

    api.start()
    expect(api.progress.value).toBe(0)
    vi.advanceTimersByTime(1200)
    expect(onComplete).toHaveBeenCalledTimes(2)
  })

  it('abandons the hold when the tab goes to the background', () => {
    // rAF does not run in a background tab, so a hold left standing would resume from a stale
    // start and complete for someone who is not looking.
    const { api, onComplete } = mountHold(1000)

    api.start()
    vi.advanceTimersByTime(900)
    setHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))

    expect(api.holding.value).toBe(false)
    expect(api.progress.value).toBe(0)

    setHidden(false)
    vi.advanceTimersByTime(5000)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('stops the loop when its scope is torn down', () => {
    const { api, wrapper } = mountHold(1000)

    api.start()
    vi.advanceTimersByTime(100)
    wrapper.unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})
