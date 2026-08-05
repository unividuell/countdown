import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import * as api from '@/api/communities'
import { communityKey } from '@/communities/context'
import type { CommunityResponse } from '@/api/types'
import Page from '@/pages/c/[slug]/index.vue'
import RoundFallback from '@/communities/fallbacks/RoundFallback.vue'
import { _resetCountdownState } from '@/communities/useCountdown'

// The page mounts RoundFallback, which uses the module-level countdown clock.
enableAutoUnmount(afterEach)
beforeEach(_resetCountdownState)

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

  // happy-dom computes no layout, so this cannot measure the jump — it pins the decision that let
  // the jump in: the height must come from one place. Three branches each carrying their own
  // min-height is how the loading state ended up 10px shorter than a row with live-points badges.
  it('takes the reserved height from the section, not from each state', async () => {
    vi.spyOn(api, 'getRoster').mockResolvedValue([
      {
        userId: 'u1',
        shortName: 'AMY',
        fullName: 'amy',
        bgColorHex: '#8e44ad',
        points: { stable: 3, live: 5 },
      },
    ])
    const w = mountPage()
    const section = w.get('section')
    expect(section.classes()).toContain('min-h-[72px]')
    expect(w.get('[data-test="roster-placeholder"]').classes().join(' ')).not.toContain('min-h')
    await flushPromises()
    expect(w.get('section').classes()).toContain('min-h-[72px]')
    expect(w.get('[data-test="row"]').classes().join(' ')).not.toContain('min-h')
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

  // A failed roster never retries, so null ("not known yet") would hold the card at a placeholder
  // forever; [] is "no winner information", which the card can still say something about.
  it('tells the fallback there is no winner when the roster failed', async () => {
    vi.spyOn(api, 'getRoster').mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = mountPage()
    await flushPromises()
    expect(w.findComponent(RoundFallback).props('members')).toEqual([])
  })
})
