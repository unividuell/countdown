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
