import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import type { RoundResponse } from '@/api/types'
import LabelledDivider from '@/ui/LabelledDivider.vue'
import RoundCard from '@/rounds/RoundCard.vue'
import RoundHistory from '@/rounds/RoundHistory.vue'
import { _resetSharedClock } from '@/ui/sharedClock'
import { useRoundHistory } from '@/rounds/useRoundHistory'

/**
 * The composable is mocked: its own derivation of the pointer is covered by
 * `useRoundHistory.spec.ts`, so this file only checks what the section renders for a given state.
 */
vi.mock('@/rounds/useRoundHistory', () => ({ useRoundHistory: vi.fn() }))

// Only Weltanschauung's tip grid calls `useRouter` — needed for the spot-object round below, whose
// tile is real (not stubbed), unlike every other game this file mounts.
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const closed = (number: number): RoundResponse => ({
  round: {
    number,
    label: `T-${number}`,
    start: '2026-08-10T10:00:00Z',
    end: '2026-08-11T10:00:00Z',
  },
  game: { id: 'guess-hue', displayName: 'Farbausmalung', requiresReveal: false },
  noGameReason: null,
  previousRoundNumber: null,
  payload: { description: 'x' },
  solution: { targetHue: 5, toleranceDeg: 10 },
  me: null,
  others: [],
  awardRule: 'ALL_QUALIFYING',
  awardPoints: 1,
  canOverride: false,
})

/**
 * A closed Weltanschauung round: the one game whose reveal tile is itself a link, built from a
 * `tipPath` this component has to supply — the round-card contract every other game in this file
 * ignores without noticing.
 */
const closedSpotObject = (number: number): RoundResponse => ({
  round: {
    number,
    label: `T-${number}`,
    start: '2026-08-10T10:00:00Z',
    end: '2026-08-11T10:00:00Z',
  },
  game: { id: 'spot-object', displayName: 'Weltanschauung', requiresReveal: false },
  noGameReason: null,
  previousRoundNumber: null,
  payload: { term: 'Roter Briefkasten' },
  solution: null,
  me: {
    userId: 'me',
    username: 'Fry',
    avatar: { shortName: 'FRY', bgColorHex: '#bf40b3' },
    stage: 0,
    guess: { panoId: 'pano-1', heading: 0, pitch: 0, zoom: 1 },
    outcome: { country: 'DE' },
    points: 1,
    durationMs: null,
    votes: [],
    struck: false,
    adminOverride: null,
    revealedAt: '2026-08-10T11:00:00Z',
    guessedAt: '2026-08-10T11:05:00Z',
  },
  others: [
    {
      userId: 'other',
      username: 'Leela',
      avatar: { shortName: 'LEE', bgColorHex: '#40bf7a' },
      stage: 0,
      guess: { panoId: 'pano-2', heading: 0, pitch: 0, zoom: 1 },
      outcome: { country: 'US' },
      points: null,
      durationMs: null,
      votes: [],
      struck: false,
      adminOverride: null,
    },
  ],
  awardRule: 'ALL_QUALIFYING',
  awardPoints: 1,
  canOverride: false,
})

function mockHistory(
  over: { items?: RoundResponse[]; canLoadMore?: boolean; error?: string | null } = {},
): ReturnType<typeof useRoundHistory> {
  return {
    items: ref(over.items ?? []),
    busy: ref(false),
    error: ref(over.error ?? null),
    canLoadMore: computed(() => over.canLoadMore ?? false),
    loadMore: vi.fn().mockResolvedValue(undefined),
  }
}

// RoundCard mounts the header band, which subscribes to the shared clock while it lives.
enableAutoUnmount(afterEach)
afterEach(_resetSharedClock)
afterEach(() => vi.clearAllMocks())

describe('RoundHistory', () => {
  it('renders nothing at all while the run has no past', () => {
    vi.mocked(useRoundHistory).mockReturnValue(mockHistory())

    const w = mount(RoundHistory, { props: { slug: 'team', from: null } })

    expect(w.findComponent(LabelledDivider).exists()).toBe(false)
    expect(w.find('[data-test="history-more"]').exists()).toBe(false)
  })

  it('labels the seam and renders every loaded round as a closed card', () => {
    vi.mocked(useRoundHistory).mockReturnValue(
      mockHistory({ items: [closed(13), closed(14)], canLoadMore: true }),
    )

    const w = mount(RoundHistory, { props: { slug: 'team', from: 13 } })

    expect(w.findAllComponents(LabelledDivider)[0]?.text()).toBe('Abgeschlossene Runden')
    const cards = w.findAllComponents(RoundCard)
    expect(cards).toHaveLength(2)
    expect(cards[0]?.props('closed')).toBe(true)
    // `props()` is typed `unknown`, so the builder has to be narrowed before it can be called.
    const assetUrl = cards[0]?.props('assetUrl') as (key: number) => string
    expect(assetUrl(99)).toBe('/api/communities/team/rounds/13/assets/99')
  })

  it('asks for more until the beginning, then says so instead', async () => {
    const history = mockHistory({ items: [closed(13)], canLoadMore: true })
    vi.mocked(useRoundHistory).mockReturnValue(history)

    const more = mount(RoundHistory, { props: { slug: 'team', from: 13 } })
    await more.get('[data-test="history-more"]').trigger('click')
    expect(history.loadMore).toHaveBeenCalledOnce()

    vi.mocked(useRoundHistory).mockReturnValue(
      mockHistory({ items: [closed(13)], canLoadMore: false }),
    )
    const done = mount(RoundHistory, { props: { slug: 'team', from: 13 } })

    expect(done.find('[data-test="history-more"]').exists()).toBe(false)
    expect(done.findAllComponents(LabelledDivider).at(-1)?.text()).toBe(
      'Du bist ganz am Anfang angekommen',
    )
  })

  // Pins the wiring bug found in review: this call site forwarded `asset-url` but not `tip-path`,
  // so a closed Weltanschauung round's tile threw `TypeError: props.tipPath is not a function` the
  // moment it was opened — nothing gated the grid on the prop being present, and no other test
  // walked a spot-object round through this component.
  it('wires a tip-path into a closed spot-object round, so opening its tile does not crash', async () => {
    vi.mocked(useRoundHistory).mockReturnValue(mockHistory({ items: [closedSpotObject(13)] }))

    const w = mount(RoundHistory, { props: { slug: 'team', from: 13 } })

    await w.get('[data-test="tip-tile"]').trigger('click')
  })

  // A closed round's tips belong to everyone, and a card that fell back to the board would mount a
  // live, billed Maps JS load per unplayed round in this very list.
  it('shows the tips, not a map, for a closed round the viewer never played', () => {
    const round = { ...closedSpotObject(13), me: null }
    vi.mocked(useRoundHistory).mockReturnValue(mockHistory({ items: [round] }))

    const w = mount(RoundHistory, { props: { slug: 'team', from: 13 } })

    expect(w.find('[data-test="tip-grid"]').exists()).toBe(true)
    expect(w.find('[data-test="spot-map"]').exists()).toBe(false)
  })

  it('reports a failed load without dropping what it already has', () => {
    vi.mocked(useRoundHistory).mockReturnValue(
      mockHistory({
        items: [closed(13)],
        canLoadMore: true,
        error: 'Die Runde konnte nicht geladen werden.',
      }),
    )

    const w = mount(RoundHistory, { props: { slug: 'team', from: 13 } })

    expect(w.get('[data-test="history-error"]').text()).toBe(
      'Die Runde konnte nicht geladen werden.',
    )
    expect(w.findAllComponents(RoundCard)).toHaveLength(1)
    expect(w.find('[data-test="history-more"]').exists()).toBe(true)
  })
})
