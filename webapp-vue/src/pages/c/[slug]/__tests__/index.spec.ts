import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import * as api from '@/api/communities'
import { communityKey } from '@/communities/context'
import type { CommunityResponse } from '@/api/types'
import Page from '@/pages/c/[slug]/index.vue'
import RoundFallback from '@/communities/fallbacks/RoundFallback.vue'

const community: CommunityResponse = {
  id: 'c1',
  name: 'Team',
  slug: 'team',
  startsAt: null,
  startsAtTimezone: 'Europe/Berlin',
  phaseTwoStartRound: null,
  viewerIsAdmin: false,
  pendingCount: 0,
}

function mountPage() {
  return mount(Page, {
    global: {
      provide: {
        [communityKey as symbol]: { community: ref(community), refresh: async () => {} },
      },
    },
  })
}

describe('community home', () => {
  it('reserves the row height while loading, so nothing jumps', () => {
    vi.spyOn(api, 'getRoster').mockReturnValue(new Promise(() => {}))
    const w = mountPage()
    expect(w.find('[data-test="roster-placeholder"]').exists()).toBe(true)
  })

  it('renders the row once the roster arrives', async () => {
    vi.spyOn(api, 'getRoster').mockResolvedValue([
      {
        userId: 'u1',
        shortName: 'AMY',
        fullName: 'amy',
        bgColorHex: '#8e44ad',
        points: { stable: 3 },
      },
    ])
    const w = mountPage()
    await flushPromises()
    expect(w.find('[data-swarm-item]').exists()).toBe(true)
    expect(w.find('[data-test="roster-placeholder"]').exists()).toBe(false)
  })

  it('says so when the roster cannot be loaded', async () => {
    vi.spyOn(api, 'getRoster').mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = mountPage()
    await flushPromises()
    expect(w.find('[data-test="roster-error"]').text()).toContain('konnten nicht')
  })

  it('fills the space below the row with the fallback content', async () => {
    vi.spyOn(api, 'getRoster').mockResolvedValue([])
    const w = mountPage()
    await flushPromises()
    expect(w.find('[data-test="fallback-no-date"]').text()).toContain('Noch kein Termin')
  })

  it('withholds the roster from the fallback until it has loaded', () => {
    vi.spyOn(api, 'getRoster').mockReturnValue(new Promise(() => {}))
    const w = mountPage()
    expect(w.findComponent(RoundFallback).props('members')).toBe(null)
  })
})
