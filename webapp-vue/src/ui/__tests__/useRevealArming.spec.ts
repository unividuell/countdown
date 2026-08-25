import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { useRevealArming } from '@/ui/useRevealArming'

/**
 * The composable calls `onMounted`/`onBeforeUnmount`, which need a component instance — so it is
 * exercised inside a throwaway host rather than called bare, the same way `useHoldProgress` is.
 */
function mountArming(still: boolean, onArmed?: () => void) {
  let api!: ReturnType<typeof useRevealArming>
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useRevealArming(still, onArmed)
        return () => h('div')
      },
    }),
  )
  return { api, wrapper }
}

describe('useRevealArming', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is shown from the first tick when still, with nothing scheduled', () => {
    const { api } = mountArming(true)

    expect(api.shown.value).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('starts hidden and needs two painted frames before it shows, not one', () => {
    const { api } = mountArming(false)

    expect(api.shown.value).toBe(false)

    vi.advanceTimersByTime(16)
    expect(api.shown.value).toBe(false)

    vi.advanceTimersByTime(16)
    expect(api.shown.value).toBe(true)
  })

  it('hands off to the caller only once armed, never when still', () => {
    const armedAt = vi.fn(() => api.shown.value)
    const { api } = mountArming(false, armedAt)

    vi.advanceTimersByTime(32)

    expect(armedAt).toHaveBeenCalledTimes(1)
    expect(armedAt.mock.results[0]?.value).toBe(true)

    const stillArmed = vi.fn()
    mountArming(true, stillArmed)
    vi.advanceTimersByTime(32)

    expect(stillArmed).not.toHaveBeenCalled()
  })

  it('cancels the pending frame when torn down before it fires', () => {
    const { api, wrapper } = mountArming(false)

    vi.advanceTimersByTime(16)
    wrapper.unmount()

    expect(vi.getTimerCount()).toBe(0)
    expect(api.shown.value).toBe(false)
  })

  it('treats a missing requestAnimationFrame as still, so a caller can never forget the guard', () => {
    vi.useRealTimers()
    const original = window.requestAnimationFrame
    Reflect.deleteProperty(window, 'requestAnimationFrame')

    const { api } = mountArming(false)

    expect(api.shown.value).toBe(true)

    window.requestAnimationFrame = original
  })
})
