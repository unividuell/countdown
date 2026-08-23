import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, type Ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/rounds'
import type { RoundResponse } from '@/api/types'
import { useRoundHistory } from '../useRoundHistory'

const closed = (number: number, previous: number | null): RoundResponse => ({
  round: {
    number,
    label: `T-${number}`,
    start: '2026-08-10T10:00:00Z',
    end: '2026-08-11T10:00:00Z',
  },
  game: { id: 'guess-hue', displayName: 'Farbausmalung', requiresReveal: false },
  noGameReason: null,
  previousRoundNumber: previous,
  payload: { description: 'x' },
  solution: { targetHue: 5, toleranceDeg: 10 },
  me: null,
  others: [],
  awardRule: 'ALL_QUALIFYING',
  awardPoints: 1,
})

/** The composable watches `from` immediately, so it needs a host component to run its effects. */
function host(from: Ref<number | null>) {
  let api: ReturnType<typeof useRoundHistory>
  const Cmp = defineComponent({
    setup() {
      api = useRoundHistory('team', from)
      return () => h('div')
    },
  })
  return { Cmp, history: () => api }
}

describe('useRoundHistory', () => {
  afterEach(() => vi.restoreAllMocks())

  it('loads the previous round by itself', async () => {
    const spy = vi.spyOn(api, 'getRound').mockResolvedValue(closed(13, 14))
    const { Cmp, history } = host(ref(13))

    mount(Cmp)
    await flushPromises()

    expect(spy).toHaveBeenCalledExactlyOnceWith('team', 13)
    expect(history().items.value).toHaveLength(1)
    expect(history().canLoadMore.value).toBe(true)
  })

  it('walks further back on demand and stops when the pointer runs out', async () => {
    vi.spyOn(api, 'getRound').mockImplementation(async (_slug, number) =>
      number === 13 ? closed(13, 14) : closed(14, null),
    )
    const { Cmp, history } = host(ref(13))

    mount(Cmp)
    await flushPromises()
    await history().loadMore()

    expect(history().items.value.map((i) => i.round?.number)).toEqual([13, 14])
    expect(history().canLoadMore.value).toBe(false)
  })

  it('renders nothing to load while there is no history', async () => {
    const spy = vi.spyOn(api, 'getRound').mockResolvedValue(closed(13, null))
    const { Cmp, history } = host(ref(null))

    mount(Cmp)
    await flushPromises()

    expect(spy).not.toHaveBeenCalled()
    expect(history().canLoadMore.value).toBe(false)
  })

  it('drops a second load while one is in flight', async () => {
    let release: (r: RoundResponse) => void = () => {}
    vi.spyOn(api, 'getRound').mockReturnValue(
      new Promise<RoundResponse>((resolve) => {
        release = resolve
      }),
    )
    const { Cmp, history } = host(ref(13))

    mount(Cmp)
    // The eager first load is still open; a click now must be dropped, not queued — queueing would
    // append the same round twice a moment later.
    const second = history().loadMore()
    release(closed(13, 14))
    await second
    await flushPromises()

    expect(api.getRound).toHaveBeenCalledTimes(1)
    expect(history().items.value).toHaveLength(1)
  })

  it('keeps what it has when a load fails, and says so', async () => {
    vi.spyOn(api, 'getRound')
      .mockResolvedValueOnce(closed(13, 14))
      .mockRejectedValueOnce(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { Cmp, history } = host(ref(13))

    mount(Cmp)
    await flushPromises()
    await history().loadMore()

    expect(history().items.value).toHaveLength(1)
    expect(history().error.value).toBe('Die Runde konnte nicht geladen werden.')
    // The pointer is unchanged, so the button stays and the click can be retried.
    expect(history().canLoadMore.value).toBe(true)
  })

  it('starts over when the current round moves under an open tab', async () => {
    vi.spyOn(api, 'getRound').mockImplementation(async (_slug, number) =>
      closed(number, number + 1),
    )
    const from = ref<number | null>(13)
    const { Cmp, history } = host(from)

    mount(Cmp)
    await flushPromises()
    await history().loadMore()
    expect(history().items.value).toHaveLength(2)

    // The day boundary passed: `useRound` refetched a different round after a 409, so the history
    // hangs off the wrong place and is rebuilt from the new one.
    from.value = 12
    await flushPromises()

    expect(history().items.value.map((i) => i.round?.number)).toEqual([12])
  })
})
