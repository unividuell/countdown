import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import * as api from '@/api/communities'
import { communityKey } from '@/communities/context'
import type { CommunityResponse, RoundResponse } from '@/api/types'
import Page from '@/pages/c/[slug]/index.vue'
import RoundCard from '@/rounds/RoundCard.vue'
import RoundFallback from '@/communities/fallbacks/RoundFallback.vue'
import { _resetCountdownState } from '@/communities/useCountdown'
import { useRound } from '@/rounds/useRound'
import type { RoundStage } from '@/rounds/useRound'

// The page mounts RoundFallback, which uses the module-level countdown clock.
enableAutoUnmount(afterEach)
beforeEach(_resetCountdownState)

/**
 * `useRound` is mocked at the page level: its own derivation of `stage` from a `RoundResponse` is
 * already covered by `src/rounds/__tests__/useRound.spec.ts`, so this file only has to check the
 * page's wiring — which branch a given `stage` picks, and that a `guessed` emit reaches the
 * roster's `reload`. Real `ref`/`computed` (not plain objects) so the template's auto-unwrapping
 * behaves exactly as it does for the real hook.
 */
vi.mock('@/rounds/useRound', () => ({ useRound: vi.fn() }))

function mockUseRound(
  over: {
    stage?: RoundStage
    loading?: boolean
    failed?: boolean
    round?: RoundResponse | null
  } = {},
): ReturnType<typeof useRound> {
  return {
    round: ref(over.round ?? null),
    state: ref(over.loading ? 'loading' : over.failed ? 'failed' : 'ready'),
    stage: computed(() => over.stage ?? 'no-game'),
    busy: ref(false),
    notice: ref(null),
    reveal: vi.fn().mockResolvedValue(undefined),
    submit: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
  }
}

beforeEach(() => {
  vi.mocked(useRound).mockReturnValue(mockUseRound())
})

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

  it('shows the round card when the round has a game', () => {
    vi.mocked(useRound).mockReturnValue(mockUseRound({ stage: 'playing' }))
    vi.spyOn(api, 'getRoster').mockResolvedValue([])
    const w = mountPage()
    expect(w.findComponent(RoundCard).exists()).toBe(true)
    expect(w.findComponent(RoundFallback).exists()).toBe(false)
  })

  it('falls back to the countdown when the round has no game', () => {
    vi.mocked(useRound).mockReturnValue(mockUseRound({ stage: 'no-game' }))
    vi.spyOn(api, 'getRoster').mockResolvedValue([])
    const w = mountPage()
    expect(w.findComponent(RoundFallback).exists()).toBe(true)
    expect(w.findComponent(RoundCard).exists()).toBe(false)
  })

  it('does not flip between the card and the fallback while the round is loading', () => {
    vi.mocked(useRound).mockReturnValue(mockUseRound({ loading: true }))
    vi.spyOn(api, 'getRoster').mockResolvedValue([])
    const w = mountPage()
    expect(w.find('[data-test="round-placeholder"]').exists()).toBe(true)
    expect(w.findComponent(RoundCard).exists()).toBe(false)
    expect(w.findComponent(RoundFallback).exists()).toBe(false)
  })

  // Mirrors the roster's own `roster-error` branch just above it: a transient 500 must say so,
  // not fall through to the "no game" fallback — which for a running event reads as "Und jetzt
  // viel Spaß zusammen!", i.e. the opposite of "something is wrong, try again later".
  it('says so instead of falling back when the round failed to load', () => {
    vi.mocked(useRound).mockReturnValue(mockUseRound({ failed: true }))
    vi.spyOn(api, 'getRoster').mockResolvedValue([])
    const w = mountPage()
    expect(w.find('[data-test="round-error"]').text()).toContain('konnte nicht')
    expect(w.findComponent(RoundFallback).exists()).toBe(false)
    expect(w.findComponent(RoundCard).exists()).toBe(false)
  })

  it('reloads the roster after a guess', async () => {
    vi.mocked(useRound).mockReturnValue(mockUseRound({ stage: 'playing' }))
    const getRoster = vi.spyOn(api, 'getRoster').mockResolvedValue([])
    const w = mountPage()
    await flushPromises()
    getRoster.mockClear()

    // The card's own contract (submit went through ⇒ emit `guessed`) is RoundCard's own test's
    // job; this only checks the page reacts to that emit by reloading the roster — so the emit is
    // triggered directly rather than by driving a game component to a real guess.
    await w.findComponent(RoundCard).vm.$emit('guessed')
    await flushPromises()
    expect(getRoster).toHaveBeenCalledTimes(1)
  })
})
