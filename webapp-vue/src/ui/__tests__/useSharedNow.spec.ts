import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { _resetSharedClock, nowMs, skewMs, useSharedNow } from '@/ui/sharedClock'

// Every consumer of the clock renders the number it reads, so a desync between two of them is
// visible as two different strings rather than as an internal value nobody can see.
const Reader = defineComponent({
  setup() {
    const now = useSharedNow()
    return () => h('span', String(now.value))
  },
})

enableAutoUnmount(afterEach)

/**
 * Whether the clock's interval is still running, asked of the clock rather than of
 * `vi.getTimerCount()`. That count is every pending timer in the environment, and Vue schedules one
 * of its own — a dev-only three-second devtools probe — on the first `mount()` of a file. Which
 * case that is depends on the order the file runs in, so the number did too.
 */
function isTicking(): boolean {
  const before = nowMs.value
  vi.advanceTimersByTime(1000)
  return nowMs.value !== before
}

describe('useSharedNow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _resetSharedClock()
  })
  afterEach(() => {
    _resetSharedClock()
    vi.useRealTimers()
  })

  it('hands two consumers the same instant, whenever each of them mounted', async () => {
    const first = mount(Reader)
    vi.advanceTimersByTime(400)
    const second = mount(Reader)
    vi.advanceTimersByTime(1000)
    await nextTick()

    expect(second.text()).toBe(first.text())
  })

  it('advances once a second', async () => {
    const reader = mount(Reader)
    const before = Number(reader.text())

    vi.advanceTimersByTime(1000)
    await nextTick()

    expect(Number(reader.text())).toBe(before + 1000)
  })

  it('corrects by the recorded server skew, so it reads the server clock and not the browser one', async () => {
    const reader = mount(Reader)
    const browserNow = Number(reader.text())

    skewMs.value = 5_000
    await nextTick()

    expect(Number(reader.text())).toBe(browserNow + 5_000)
  })

  // The interval outlives the component unless the release is exact, and a page that mounts and
  // drops round cards would then leave one running per visit.
  it('stops ticking once the last consumer is gone', () => {
    const first = mount(Reader)
    const second = mount(Reader)

    first.unmount()
    expect(isTicking()).toBe(true)

    second.unmount()
    expect(isTicking()).toBe(false)
  })
})
