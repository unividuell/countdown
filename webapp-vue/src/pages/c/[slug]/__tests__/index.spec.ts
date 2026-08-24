import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { computed, defineComponent, ref } from 'vue'
import * as api from '@/api/communities'
import * as client from '@/api/client'
import { communityKey } from '@/communities/context'
import type {
  CommunityResponse,
  MeResponse,
  RosterMemberResponse,
  RoundResponse,
} from '@/api/types'
import { _resetAuthState, useAuth } from '@/auth/useAuth'
import MemberRow from '@/members/MemberRow.vue'
import Page from '@/pages/c/[slug]/index.vue'
import RoundCard from '@/rounds/RoundCard.vue'
import RoundFallback from '@/communities/fallbacks/RoundFallback.vue'
import RoundHistory from '@/rounds/RoundHistory.vue'
import { _resetCountdownState } from '@/communities/useCountdown'
import { SPOILER_HOLD_MS } from '@/members/useRoster'
import { useRound } from '@/rounds/useRound'
import type { RoundStage } from '@/rounds/useRound'

/**
 * Stubbed at the page level: what the section renders is covered by `RoundHistory.spec.ts`, and the
 * real component would fetch. This file only checks the page's wiring — which entry point the
 * history is given.
 */
vi.mock('@/rounds/RoundHistory.vue', () => ({
  default: defineComponent({
    name: 'RoundHistory',
    props: { slug: { type: String, required: true }, from: { type: Number, default: null } },
    template: '<div data-test="round-history" />',
  }),
}))

// The page mounts RoundFallback, which uses the module-level countdown clock.
enableAutoUnmount(afterEach)
beforeEach(_resetCountdownState)
beforeEach(_resetAuthState)
// Unconditional, so a case that fails between `useFakeTimers` and its last assertion cannot leave
// the rest of the file on a frozen clock. A no-op when the timers are already real.
afterEach(() => vi.useRealTimers())

/**
 * `useRound` is mocked at the page level: its own derivation of `stage` from a `RoundResponse` is
 * already covered by `src/rounds/__tests__/useRound.spec.ts`, so this file only has to check the
 * page's wiring — which branch a given `stage` picks, and that a `guessed` emit reaches the
 * roster's `refresh`. Real `ref`/`computed` (not plain objects) so the template's auto-unwrapping
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
    skip: vi.fn().mockResolvedValue(undefined),
    giveUp: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
  }
}

const aRoundResponse = (over: Partial<RoundResponse> = {}): RoundResponse => ({
  round: { number: 12, label: 'T-12', start: '2026-08-14T10:00:00Z', end: '2026-08-15T10:00:00Z' },
  game: { id: 'guess-hue', displayName: 'Farbausmalung', requiresReveal: false },
  noGameReason: null,
  previousRoundNumber: null,
  payload: null,
  solution: null,
  me: null,
  others: [],
  awardRule: 'ALL_QUALIFYING',
  awardPoints: 1,
  ...over,
})

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
  gamesFromRound: null,
  viewerIsAdmin: false,
  pendingCount: 0,
  editionFrozen: false,
  viewerIdentity: null,
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
        points: { stable: 3, live: { points: 5, provisional: true } },
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

  it('tells the row who the viewer is, so their own rise can box its way through', async () => {
    // Only the viewer's own climb gets the shoving treatment (see members/reorder.ts), and the row
    // has no way to know who that is — the page is where the session and the roster meet.
    const viewer: MeResponse = {
      id: 'u1',
      username: 'amy',
      githubLogin: 'amy',
      githubName: null,
      email: null,
      bgColorHex: null,
      displayName: null,
      avatar: { shortName: 'AMY', bgColorHex: '#8e44ad' },
      isSuperAdmin: false,
      mayCreateCommunities: false,
      createdAt: null,
    }
    vi.spyOn(client, 'apiFetch').mockResolvedValue(viewer)
    await useAuth().bootstrap()
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

    expect(w.findComponent(MemberRow).props('meId')).toBe('u1')
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

  // The placeholder reserves the round's height, and `aspect-square` makes that height its width.
  // Without the bleed it reserves 343px where the card will be 375, so the page drops 32px the
  // moment the response lands — the very jump this element exists to prevent.
  it('reserves the width the round will actually have', () => {
    vi.mocked(useRound).mockReturnValue(mockUseRound({ loading: true }))
    vi.spyOn(api, 'getRoster').mockResolvedValue([])
    const w = mountPage()
    const placeholder = w.get('[data-test="round-placeholder"]')

    expect(placeholder.classes()).toContain('round-bleed')
    expect(placeholder.classes()).toContain('aspect-square')
    expect(placeholder.classes()).not.toContain('w-full')
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

  // The failed-load branch must win even when `stage` still reads a stale card-worthy value —
  // e.g. the GET succeeded (so `stage` derived `sealed`) but a later implicit reveal 404'd (so
  // `state` flipped to `failed`). Pins the ordering fix: `roundState === 'failed'` is checked
  // ahead of `stage !== 'no-game'`, not the other way round.
  it('never renders a play affordance when the round failed to load, even with a stale sealed stage', () => {
    vi.mocked(useRound).mockReturnValue(mockUseRound({ failed: true, stage: 'sealed' }))
    vi.spyOn(api, 'getRoster').mockResolvedValue([])
    const w = mountPage()
    expect(w.find('[data-test="round-error"]').text()).toContain('konnte nicht')
    expect(w.findComponent(RoundCard).exists()).toBe(false)
    expect(w.findComponent(RoundFallback).exists()).toBe(false)
  })

  // The card's own contract (submit went through ⇒ emit `guessed`) is RoundCard's own test's job;
  // these two only check what the page does with that emit — so the emit is triggered directly
  // rather than by driving a game component to a real guess.
  //
  // What the page must route it into is `refreshAfterGuess`, not `refresh`: the round's points are
  // in the roster's answer the moment the guess is accepted, and the ranking would print them
  // above a game that is still revealing them. The hold itself belongs to `useRoster` and is
  // tested there; here it is only the wiring — hence the fake timers.
  it('takes the new points and the new order once the game has shown them', async () => {
    vi.useFakeTimers()
    vi.mocked(useRound).mockReturnValue(mockUseRound({ stage: 'playing' }))
    const amy = { userId: 'u1', shortName: 'AMY', fullName: 'amy', bgColorHex: '#8e44ad' }
    const fry = { userId: 'u2', shortName: 'FRY', fullName: 'fry', bgColorHex: '#bf40b3' }
    const getRoster = vi.spyOn(api, 'getRoster')
    // Reset, not a queue of `Once`s: spies are installed per test and never restored here, so both
    // the call counter *and* unconsumed queue entries carry over from this file's earlier tests.
    getRoster.mockReset()
    let answer: RosterMemberResponse[] = [
      { ...fry, points: { stable: 3 } },
      { ...amy, points: { stable: 0 } },
    ]
    getRoster.mockImplementation(async () => answer)
    const w = mountPage()
    await vi.advanceTimersByTimeAsync(0)
    getRoster.mockClear()
    // The server ranks by stable + live, so a guess can reorder the row: amy's live points overtake
    // fry. The row has to follow that, badges and order both — but not before its time.
    answer = [
      { ...amy, points: { stable: 0, live: { points: 5, provisional: true } } },
      { ...fry, points: { stable: 3 } },
    ]

    await w.findComponent(RoundCard).vm.$emit('guessed')
    await vi.advanceTimersByTimeAsync(SPOILER_HOLD_MS - 1)

    expect(getRoster).not.toHaveBeenCalled()
    expect(w.findAll('[data-swarm-item]').map((el) => el.attributes('aria-label'))).toEqual([
      'fry, 3 Punkte',
      'amy, 0 Punkte',
    ])

    await vi.advanceTimersByTimeAsync(1)
    // The hold expiring only asks; the answer lands a microtask after that tick.
    await vi.advanceTimersByTimeAsync(0)

    expect(getRoster).toHaveBeenCalledTimes(1)
    expect(w.findAll('[data-swarm-item]').map((el) => el.attributes('aria-label'))).toEqual([
      'amy, 0 Punkte, diese Runde vorläufig +5',
      'fry, 3 Punkte',
    ])
  })

  it('patches the row in place after a guess instead of flying it in again', async () => {
    vi.useFakeTimers()
    vi.mocked(useRound).mockReturnValue(mockUseRound({ stage: 'playing' }))
    const getRoster = vi.spyOn(api, 'getRoster')
    getRoster.mockReset()
    getRoster.mockResolvedValue([
      {
        userId: 'u1',
        shortName: 'AMY',
        fullName: 'amy',
        bgColorHex: '#8e44ad',
        points: { stable: 0 },
      },
    ])
    const w = mountPage()
    await vi.advanceTimersByTimeAsync(0)
    const rowBefore = w.get('[data-test="row"]').element

    await w.findComponent(RoundCard).vm.$emit('guessed')
    await vi.advanceTimersByTimeAsync(SPOILER_HOLD_MS)
    await vi.advanceTimersByTimeAsync(0)

    // MemberRow measures its resting positions in `onMounted`, so a remount is exactly what replays
    // the fly-in. Same DOM element ⇒ the row was patched, not torn down and rebuilt. The
    // placeholder is the visible half of that tear-down: `state` must not dip through 'loading'.
    expect(w.get('[data-test="row"]').element).toBe(rowBefore)
    expect(w.find('[data-test="roster-placeholder"]').exists()).toBe(false)
  })

  it("hands the history the running round's previous-round pointer", () => {
    // `game: null` — the mocked `stage` is decoupled from the round data here (`useRound` itself
    // is mocked), and this test cares only about `from`. Keeping the real `guess-hue` id would
    // mount the actual game component, which requires a real payload/solution/`me` for a 'done'
    // round; irrelevant detail this test has no reason to supply.
    vi.mocked(useRound).mockReturnValue(
      mockUseRound({
        stage: 'done',
        round: aRoundResponse({ previousRoundNumber: 13, game: null }),
      }),
    )

    const w = mountPage()

    expect(w.findComponent(RoundHistory).props('from')).toBe(13)
  })

  it('hangs the history under the fallback too', () => {
    vi.mocked(useRound).mockReturnValue(
      mockUseRound({ stage: 'no-game', round: aRoundResponse({ previousRoundNumber: 13 }) }),
    )

    const w = mountPage()

    // After the event, looking back is the only reason left to open the page.
    expect(w.findComponent(RoundFallback).exists()).toBe(true)
    expect(w.findComponent(RoundHistory).props('from')).toBe(13)
  })

  it('mounts no history while the round is still loading', () => {
    vi.mocked(useRound).mockReturnValue(mockUseRound({ loading: true }))

    const w = mountPage()

    expect(w.findComponent(RoundHistory).exists()).toBe(false)
  })
})
