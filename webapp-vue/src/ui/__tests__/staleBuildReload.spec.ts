import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent, h } from 'vue'
import { isStaleChunkError, registerStaleBuildReload } from '@/ui/staleBuildReload'

const Stub = defineComponent({ render: () => h('div') })

function makeRouter(error: Error) {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Stub },
      { path: '/admin', component: () => Promise.reject(error) },
    ],
  })
}

const firefox = new TypeError('error loading dynamically imported module: https://x/assets/a-1.js')

describe('stale build reload', () => {
  beforeEach(() => sessionStorage.clear())

  it('recognises each engine’s failed dynamic import', () => {
    expect(isStaleChunkError(firefox)).toBe(true)
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: x'))).toBe(
      true,
    )
    expect(isStaleChunkError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isStaleChunkError(new Error('boom'))).toBe(false)
  })

  it('reloads the target page when its chunk is gone', async () => {
    const reload = vi.fn()
    const router = makeRouter(firefox)
    registerStaleBuildReload(router, reload)

    await router.push('/admin?tab=1').catch(() => {})

    expect(reload).toHaveBeenCalledWith('/admin?tab=1')
  })

  it('reloads once per target, so a chunk missing after reload cannot loop', async () => {
    const reload = vi.fn()
    const router = makeRouter(firefox)
    registerStaleBuildReload(router, reload)

    await router.push('/admin').catch(() => {})
    await router.push('/admin').catch(() => {})

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('re-arms after a navigation lands, for the next deploy', async () => {
    const reload = vi.fn()
    const router = makeRouter(firefox)
    registerStaleBuildReload(router, reload)

    await router.push('/admin').catch(() => {})
    await router.push('/')
    await router.push('/admin').catch(() => {})

    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('does not reload without storage, since nothing could stop a loop', async () => {
    const reload = vi.fn()
    const router = makeRouter(firefox)
    registerStaleBuildReload(router, reload)
    vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked')
    })

    await router.push('/admin').catch(() => {})

    expect(reload).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('leaves other navigation errors alone', async () => {
    const reload = vi.fn()
    const router = makeRouter(new Error('boom'))
    registerStaleBuildReload(router, reload)

    await router.push('/admin').catch(() => {})

    expect(reload).not.toHaveBeenCalled()
  })
})
