import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'

const replace = vi.fn()
const refresh = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { slug: 'team' } }),
  useRouter: () => ({ replace }),
}))

// provide an admin context by mocking the inject helper
vi.mock('@/communities/context', () => ({
  useCommunityContext: () => ({
    community: {
      value: {
        id: '1',
        name: 'Team',
        slug: 'team',
        startsAt: null,
        startsAtTimezone: 'Europe/Berlin',
        phaseTwoStartRound: null,
        viewerIsAdmin: true,
        pendingCount: 1,
      },
    },
    refresh,
  }),
}))

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('requests page', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    replace.mockReset()
    refresh.mockReset()
  })
  it('lists pending members and approves one', async () => {
    const list = vi.spyOn(api, 'listMembers').mockResolvedValue([
      { userId: 'u1', username: 'Alice', status: 'PENDING', isAdmin: false },
      { userId: 'u2', username: 'Bob', status: 'ACTIVE', isAdmin: false },
    ])
    const approve = vi.spyOn(api, 'approveMember').mockResolvedValue(undefined as never)
    const Requests = (await import('@/pages/c/[slug]/requests.vue')).default
    const w = mount(Requests)
    await flushPromises()
    expect(w.text()).toContain('Alice')
    expect(w.text()).not.toContain('Bob') // only PENDING shown
    list.mockResolvedValue([{ userId: 'u2', username: 'Bob', status: 'ACTIVE', isAdmin: false }])
    await w.find('[data-test=approve-u1]').trigger('click')
    await flushPromises()
    expect(approve).toHaveBeenCalledWith('team', 'u1')
    expect(list).toHaveBeenCalledTimes(2)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('keeps separate request actions independently busy', async () => {
    const first = deferred()
    const second = deferred()
    vi.spyOn(api, 'listMembers').mockResolvedValue([
      { userId: 'u1', username: 'Alice', status: 'PENDING', isAdmin: false },
      { userId: 'u2', username: 'Bob', status: 'PENDING', isAdmin: false },
    ])
    const approve = vi
      .spyOn(api, 'approveMember')
      .mockImplementation((_slug, userId) => (userId === 'u1' ? first.promise : second.promise))
    const Requests = (await import('@/pages/c/[slug]/requests.vue')).default
    const w = mount(Requests)
    await flushPromises()

    await w.get('[data-test=approve-u1]').trigger('click')
    await w.get('[data-test=approve-u2]').trigger('click')

    expect(approve).toHaveBeenCalledTimes(2)
    expect(w.get('[data-test=approve-u1]').attributes('disabled')).toBeDefined()
    expect(w.get('[data-test=approve-u2]').attributes('disabled')).toBeDefined()
    expect(w.get('[data-test=reject-u1]').attributes('disabled')).toBeUndefined()
    expect(w.get('[data-test=approve-u1]').find('[data-test=spinner]').exists()).toBe(true)
    expect(w.get('[data-test=reject-u1]').find('[data-test=spinner]').exists()).toBe(false)

    first.resolve()
    second.resolve()
    await Promise.all([first.promise, second.promise])
    await flushPromises()

    expect(w.get('[data-test=approve-u1]').attributes('disabled')).toBeUndefined()
    expect(w.get('[data-test=approve-u2]').attributes('disabled')).toBeUndefined()
    expect(w.get('[data-test=approve-u1]').find('[data-test=spinner]').exists()).toBe(false)
    expect(w.get('[data-test=approve-u2]').find('[data-test=spinner]').exists()).toBe(false)
  })
})
