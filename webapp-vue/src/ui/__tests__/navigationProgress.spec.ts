import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent, h } from 'vue'
import {
  PENDING_DELAY_MS,
  _resetNavigationProgressState,
  navigationPending,
  registerNavigationProgress,
} from '@/ui/navigationProgress'

const Stub = defineComponent({ render: () => h('div') })

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Stub },
      { path: '/x', component: Stub },
    ],
  })
}

describe('navigation progress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _resetNavigationProgressState()
  })
  afterEach(() => vi.useRealTimers())

  it('stays hidden for a navigation that finishes inside the delay', async () => {
    const router = makeRouter()
    registerNavigationProgress(router)
    await router.push('/x')
    // Async variant: the guard that arms the timer runs a few microtask ticks after
    // push() (vue-router resolves guards through several internal promise hops), so a
    // synchronous clock advance can run before the timer is even armed. The async
    // variant drains pending microtasks between ticks of the fake clock, which lets
    // that guard actually execute.
    await vi.advanceTimersByTimeAsync(10_000)
    expect(navigationPending.value).toBe(false)
  })

  it('appears once a navigation outlasts the delay, and clears when it lands', async () => {
    const router = makeRouter()
    let release!: () => void
    const blocked = new Promise<void>((r) => {
      release = r
    })
    router.beforeResolve(async () => {
      await blocked
      return true
    })
    registerNavigationProgress(router)

    const nav = router.push('/x')
    await Promise.resolve()
    expect(navigationPending.value).toBe(false)

    await vi.advanceTimersByTimeAsync(PENDING_DELAY_MS)
    expect(navigationPending.value).toBe(true)

    release()
    await nav
    expect(navigationPending.value).toBe(false)
  })
})
