import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { BEAT_MS, useStartCeremony } from '@/ui/useStartCeremony'

/** The composable registers `onUnmounted`, so it needs a component to live in. */
function mountCeremony() {
  let api!: ReturnType<typeof useStartCeremony>
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useStartCeremony()
        return () => null
      },
    }),
  )
  return { api, wrapper }
}

/** The three beats, spent. What follows is the request. */
const COUNT_IN = 3 * BEAT_MS

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useStartCeremony', () => {
  it('counts 3 · 2 · 1 at one beat a second, then waits', async () => {
    const { api } = mountCeremony()

    const running = api.run(() => Promise.resolve())
    expect(api.step.value).toBe('3')

    await vi.advanceTimersByTimeAsync(BEAT_MS)
    expect(api.step.value).toBe('2')

    await vi.advanceTimersByTimeAsync(BEAT_MS)
    expect(api.step.value).toBe('1')

    await vi.advanceTimersByTimeAsync(BEAT_MS)
    await running
    expect(api.step.value).toBeNull()
  })

  // The server stamps the play's start when it handles this request, so the count-in has to be
  // spent before it leaves — otherwise the clock starts while the player is still being counted in.
  it('fires the reveal only once the last beat is spent', async () => {
    const { api } = mountCeremony()
    const go = vi.fn(() => Promise.resolve())

    void api.run(go)
    await vi.advanceTimersByTimeAsync(COUNT_IN - 1)
    expect(go).not.toHaveBeenCalled()
    expect(api.step.value).toBe('1')

    await vi.advanceTimersByTimeAsync(1)
    expect(go).toHaveBeenCalledTimes(1)
  })

  // The waiting step IS the request: that is what makes the board's solid field a loading
  // indicator rather than a beat with a duration of its own. A step that outlasted the answer
  // would keep saying „loading" over a game the player can already play.
  it('waits exactly as long as the reveal takes', async () => {
    const { api } = mountCeremony()

    const running = api.run(() => new Promise<void>((resolve) => setTimeout(resolve, 4 * BEAT_MS)))
    await vi.advanceTimersByTimeAsync(COUNT_IN)
    expect(api.step.value).toBe('waiting')

    await vi.advanceTimersByTimeAsync(4 * BEAT_MS - 1)
    expect(api.step.value).toBe('waiting')

    await vi.advanceTimersByTimeAsync(1)
    await running
    expect(api.step.value).toBeNull()
  })

  it('falls back to the countdown when the reveal throws', async () => {
    const { api } = mountCeremony()

    const running = api.run(() => Promise.reject(new Error('boom'))).catch((e: Error) => e.message)
    await vi.advanceTimersByTimeAsync(COUNT_IN)

    expect(await running).toBe('boom')
    expect(api.step.value).toBeNull()
  })

  it('ignores a second press while it is running', async () => {
    const { api } = mountCeremony()
    const go = vi.fn(() => Promise.resolve())

    void api.run(go)
    await api.run(go)
    await vi.advanceTimersByTimeAsync(COUNT_IN)

    expect(go).toHaveBeenCalledTimes(1)
  })

  // A ceremony whose page is gone must not still spend the player's one attempt.
  it('never reveals after its component has been unmounted', async () => {
    const { api, wrapper } = mountCeremony()
    const go = vi.fn(() => Promise.resolve())

    void api.run(go)
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(COUNT_IN)

    expect(go).not.toHaveBeenCalled()
  })
})
