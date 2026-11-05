import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { ref } from 'vue'
import * as api from '@/api/communities'
import type { CommunityResponse, EditionResponse } from '@/api/types'

const { community } = vi.hoisted(() => ({ community: { current: null as never } }))

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}))
vi.mock('@/communities/useAdminGuard', () => ({ useAdminGuard: vi.fn() }))
vi.mock('@/communities/context', () => ({
  useCommunityContext: () => ({ community: community.current, refresh: vi.fn() }),
}))

const edition: EditionResponse = {
  label: 'Hüttenwochenende',
  startsAt: '2099-12-20T17:00:00.000Z',
  startsAtTimezone: 'Europe/Berlin',
  phaseTwoStartRound: -7,
  gamesFromRound: -30,
  gamesUntilRound: 0,
  frozen: false,
}

function useCommunity(e: EditionResponse | null) {
  const c = ref<CommunityResponse>({
    id: '1',
    slug: 'team',
    name: 'Team',
    edition: e,
    viewerIsAdmin: true,
    pendingCount: 0,
    viewerIdentity: null,
  })
  community.current = c as never

  return c
}

async function mountSettings() {
  const Settings = (await import('@/pages/c/[slug]/settings.vue')).default
  const w = mount(Settings, { global: { stubs: { RouterLink: RouterLinkStub } } })
  await flushPromises()

  return w
}

describe('settings — name', () => {
  beforeEach(() => {
    useCommunity(null)
    vi.spyOn(api, 'getInvite').mockResolvedValue(null)
    vi.spyOn(api, 'updateCommunity').mockResolvedValue({} as CommunityResponse)
  })

  it('prefills the name from the community in context', async () => {
    const w = await mountSettings()
    expect((w.find('input').element as HTMLInputElement).value).toBe('Team')
  })

  it('saves only the trimmed name', async () => {
    const w = await mountSettings()
    await w.find('input').setValue('  Team Nord ')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(api.updateCommunity).toHaveBeenCalledWith('team', 'Team Nord')
  })

  it('shows the community URL prefixed with /c/, not the bare slug', async () => {
    const w = await mountSettings()
    expect(w.text()).toContain('/c/team/')
  })

  it('follows the community name after a refresh', async () => {
    const c = useCommunity(null)
    const w = await mountSettings()

    c.value = { ...c.value, name: 'Team Süd' }
    await flushPromises()

    expect((w.find('input').element as HTMLInputElement).value).toBe('Team Süd')
  })
})

describe('settings — edition', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getInvite').mockResolvedValue(null)
  })

  it('without an edition offers to create one, with no date fields', async () => {
    useCommunity(null)
    const w = await mountSettings()

    expect(w.text()).toContain('Kein Lauf aktiv.')
    const link = w.getComponent(RouterLinkStub)
    expect(link.text()).toBe('Edition erzeugen')
    expect(link.props('to')).toBe('/c/team/edition')
    expect(w.find('select').exists()).toBe(false)
    expect(w.find('input[type=date]').exists()).toBe(false)
  })

  it('with an edition shows its label, the calendar and an edit link', async () => {
    useCommunity(edition)
    const w = await mountSettings()

    expect(w.text()).toContain('Hüttenwochenende')
    expect(w.get('[data-test=edition-start]').text()).toBe('So., 20. Dez. 2099, 18:00')
    expect(w.find('[data-test=edition-grid]').exists()).toBe(true)
    const link = w.getComponent(RouterLinkStub)
    expect(link.text()).toBe('Edition bearbeiten')
    expect(link.props('to')).toBe('/c/team/edition')
  })

  it('falls back to the community name without a label', async () => {
    useCommunity({ ...edition, label: null })
    const w = await mountSettings()

    expect(w.get('[data-test=edition-title]').text()).toBe('Team')
  })
})
