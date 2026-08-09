import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { slug: 'team' } }),
  useRouter: () => ({ replace: vi.fn() }),
}))
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
        pendingCount: 0,
      },
    },
    refresh: vi.fn(),
  }),
}))

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('members admin page', () => {
  it('lists only ACTIVE members and removes one', async () => {
    const list = vi.spyOn(api, 'listMembers').mockResolvedValue([
      { userId: 'u1', username: 'Alice', status: 'ACTIVE', isAdmin: false },
      { userId: 'u2', username: 'Bob', status: 'PENDING', isAdmin: false },
    ])
    const remove = vi.spyOn(api, 'removeMember').mockResolvedValue(undefined as never)
    const Members = (await import('@/pages/c/[slug]/members.vue')).default
    const w = mount(Members)
    await flushPromises()
    expect(w.text()).toContain('Alice')
    expect(w.text()).not.toContain('Bob') // PENDING not shown
    list.mockResolvedValue([])
    await w.find('[data-test=remove-u1]').trigger('click')
    await flushPromises()
    expect(remove).toHaveBeenCalledWith('team', 'u1')
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('keeps separate member actions independently busy', async () => {
    const first = deferred()
    const second = deferred()
    const list = vi.spyOn(api, 'listMembers').mockResolvedValue([
      { userId: 'u1', username: 'Alice', status: 'ACTIVE', isAdmin: false },
      { userId: 'u2', username: 'Bob', status: 'ACTIVE', isAdmin: false },
    ])
    list.mockClear()
    const promote = vi
      .spyOn(api, 'promoteMember')
      .mockImplementation((_slug, userId) => (userId === 'u1' ? first.promise : second.promise))
    const Members = (await import('@/pages/c/[slug]/members.vue')).default
    const w = mount(Members)
    await flushPromises()

    await w.get('[data-test=promote-u1]').trigger('click')
    await w.get('[data-test=promote-u2]').trigger('click')

    expect(promote).toHaveBeenCalledTimes(2)
    expect(w.get('[data-test=promote-u1]').attributes('disabled')).toBeDefined()
    expect(w.get('[data-test=promote-u2]').attributes('disabled')).toBeDefined()
    expect(w.get('[data-test=remove-u1]').attributes('disabled')).toBeUndefined()
    expect(w.get('[data-test=promote-u1]').find('[data-test=spinner]').exists()).toBe(true)
    expect(w.get('[data-test=remove-u1]').find('[data-test=spinner]').exists()).toBe(false)

    first.resolve()
    second.resolve()
    await Promise.all([first.promise, second.promise])
    await flushPromises()

    expect(w.get('[data-test=promote-u1]').attributes('disabled')).toBeUndefined()
    expect(w.get('[data-test=promote-u2]').attributes('disabled')).toBeUndefined()
    expect(w.get('[data-test=promote-u1]').find('[data-test=spinner]').exists()).toBe(false)
    expect(w.get('[data-test=promote-u2]').find('[data-test=spinner]').exists()).toBe(false)
    expect(list).toHaveBeenCalledTimes(3)
  })
})

describe('settings page', () => {
  beforeEach(() => vi.clearAllMocks())
  it('shows the current invite link and can revoke it', async () => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue({
      id: '1',
      name: 'Team',
      slug: 'team',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
      phaseTwoStartRound: null,
      viewerIsAdmin: true,
      pendingCount: 0,
    })
    vi.spyOn(api, 'getInvite').mockResolvedValue({
      url: '/join/tok',
      expiresAt: '2030-01-01T00:00:00Z',
    })
    const revoke = vi.spyOn(api, 'revokeInvite').mockResolvedValue(undefined as never)
    const Settings = (await import('@/pages/c/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    expect(w.text()).toContain('/join/tok')
    await w.find('[data-test=revoke-invite]').trigger('click')
    await flushPromises()
    expect(revoke).toHaveBeenCalledWith('team')
  })
  it('generates an invite link and shows it', async () => {
    vi.spyOn(api, 'getCommunity').mockResolvedValue({
      id: '1',
      name: 'Team',
      slug: 'team',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
      phaseTwoStartRound: null,
      viewerIsAdmin: true,
      pendingCount: 0,
    })
    vi.spyOn(api, 'getInvite').mockResolvedValue(null)
    vi.spyOn(api, 'generateInvite').mockResolvedValue({
      url: '/join/tok123',
      expiresAt: '2030-01-01T00:00:00Z',
    })
    const Settings = (await import('@/pages/c/[slug]/settings.vue')).default
    const w = mount(Settings)
    await flushPromises()
    await w.find('[data-test=generate-invite]').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('/join/tok123')
  })
})
