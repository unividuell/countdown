import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { BEAT_MS, GO_HOLD_MS, useStartCeremony } from '@/ui/useStartCeremony'

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

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useStartCeremony', () => {
  it('counts 2 · 1 · GO! at one beat a second', async () => {
    const { api } = mountCeremony()

    const running = api.run(() => Promise.resolve())
    expect(api.beat.value).toBe('2')

    await vi.advanceTimersByTimeAsync(BEAT_MS)
    expect(api.beat.value).toBe('1')

    await vi.advanceTimersByTimeAsync(BEAT_MS)
    expect(api.beat.value).toBe('GO!')

    await vi.advanceTimersByTimeAsync(GO_HOLD_MS)
    await running
    expect(api.beat.value).toBeNull()
  })

  // The server stamps the play's start when it handles this request, so the beat the player is
  // told to go on has to be the beat the request leaves on — not the one after it.
  it('fires the reveal on the GO beat, not after it', async () => {
    const { api } = mountCeremony()
    const go = vi.fn(() => Promise.resolve())

    void api.run(go)
    await vi.advanceTimersByTimeAsync(BEAT_MS)
    expect(go).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(BEAT_MS)
    expect(api.beat.value).toBe('GO!')
    expect(go).toHaveBeenCalledTimes(1)
  })

  it('holds GO! long enough to be read, even when the reveal answers at once', async () => {
    const { api } = mountCeremony()

    const running = api.run(() => Promise.resolve())
    await vi.advanceTimersByTimeAsync(2 * BEAT_MS)
    await vi.advanceTimersByTimeAsync(GO_HOLD_MS - 1)
    expect(api.beat.value).toBe('GO!')

    await vi.advanceTimersByTimeAsync(1)
    await running
    expect(api.beat.value).toBeNull()
  })

  it('falls back to the countdown when the reveal throws', async () => {
    const { api } = mountCeremony()

    const running = api.run(() => Promise.reject(new Error('boom'))).catch((e: Error) => e.message)
    await vi.advanceTimersByTimeAsync(2 * BEAT_MS + GO_HOLD_MS)

    expect(await running).toBe('boom')
    expect(api.beat.value).toBeNull()
  })

  it('ignores a second press while the beats are running', async () => {
    const { api } = mountCeremony()
    const go = vi.fn(() => Promise.resolve())

    void api.run(go)
    await api.run(go)
    await vi.advanceTimersByTimeAsync(2 * BEAT_MS + GO_HOLD_MS)

    expect(go).toHaveBeenCalledTimes(1)
  })

  // A ceremony whose page is gone must not still spend the player's one attempt.
  it('never reveals after its component has been unmounted', async () => {
    const { api, wrapper } = mountCeremony()
    const go = vi.fn(() => Promise.resolve())

    void api.run(go)
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(2 * BEAT_MS + GO_HOLD_MS)

    expect(go).not.toHaveBeenCalled()
  })
})
