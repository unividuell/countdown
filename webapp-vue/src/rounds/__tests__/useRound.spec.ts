import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { ApiError } from '@/api/client'
import * as api from '@/api/rounds'
import type { PlayDto, RoundResponse } from '@/api/types'
import { useRound } from '../useRound'

const announced = (over: Partial<RoundResponse> = {}): RoundResponse => ({
  round: { number: 12, label: 'T-12', start: '2026-08-14T10:00:00Z', end: '2026-08-15T10:00:00Z' },
  game: { id: 'guess-hue', displayName: 'Farbausmalung', requiresReveal: false },
  noGameReason: null,
  payload: null,
  solution: null,
  me: null,
  others: [],
  awardRule: 'ALL_QUALIFYING',
  awardPoints: 1,
  ...over,
})

const aPlay = (over: Partial<PlayDto> = {}): PlayDto => ({
  userId: 'u1',
  username: 'Fry',
  avatar: { shortName: 'FRY', bgColorHex: '#bf40b3' },
  revealedAt: '2026-08-14T11:00:00Z',
  guessedAt: null,
  guess: null,
  outcome: null,
  points: null,
  ...over,
})

/** useRound loads (and possibly reveals) on mount, so it needs a host component. */
function host(slug = 'team') {
  let round: ReturnType<typeof useRound>
  const Cmp = defineComponent({
    setup() {
      round = useRound(slug)
      return () => h('div')
    },
  })
  return { Cmp, round: () => round }
}

describe('useRound', () => {
  // Each case installs its own spies via vi.spyOn; without restoring, call counts from an earlier
  // case would leak into the next and corrupt toHaveBeenCalledTimes assertions.
  afterEach(() => vi.restoreAllMocks())

  it('is revealed without asking for a game that needs no deliberate reveal', async () => {
    vi.spyOn(api, 'getCurrentRound').mockResolvedValue(announced())
    const revealSpy = vi
      .spyOn(api, 'revealRound')
      .mockResolvedValue(announced({ me: aPlay(), payload: { description: 'x' } }))
    const { Cmp, round } = host()

    mount(Cmp)
    await flushPromises()

    expect(revealSpy).toHaveBeenCalledTimes(1)
    expect(round().stage.value).toBe('playing')
  })

  it('waits for a deliberate reveal when the game wants one', async () => {
    vi.spyOn(api, 'getCurrentRound').mockResolvedValue(
      announced({ game: { id: 'guess-hue', displayName: 'Farbausmalung', requiresReveal: true } }),
    )
    const revealSpy = vi.spyOn(api, 'revealRound').mockResolvedValue(
      announced({
        game: { id: 'guess-hue', displayName: 'Farbausmalung', requiresReveal: true },
        me: aPlay(),
        payload: { description: 'x' },
      }),
    )
    const { Cmp, round } = host()

    mount(Cmp)
    await flushPromises()

    expect(revealSpy).not.toHaveBeenCalled()
    expect(round().stage.value).toBe('sealed')

    await round().reveal()

    expect(revealSpy).toHaveBeenCalledTimes(1)
    expect(round().stage.value).toBe('playing')
  })

  it('lands a returning viewer straight on the result', async () => {
    vi.spyOn(api, 'getCurrentRound').mockResolvedValue(
      announced({
        me: aPlay({ guessedAt: '2026-08-14T12:00:00Z', points: 1 }),
        solution: { targetHue: 10, toleranceDeg: 10 },
      }),
    )
    const revealSpy = vi.spyOn(api, 'revealRound')
    const { Cmp, round } = host()

    mount(Cmp)
    await flushPromises()

    expect(round().stage.value).toBe('done')
    expect(revealSpy).not.toHaveBeenCalled()
  })

  it('has no stage to play when there is no game', async () => {
    vi.spyOn(api, 'getCurrentRound').mockResolvedValue(
      announced({ game: null, noGameReason: 'AFTER_WINDOW' }),
    )
    const { Cmp, round } = host()

    mount(Cmp)
    await flushPromises()

    expect(round().stage.value).toBe('no-game')
  })

  it('sends the round number the answer showed it', async () => {
    vi.spyOn(api, 'getCurrentRound').mockResolvedValue(announced())
    vi.spyOn(api, 'revealRound').mockResolvedValue(
      announced({ me: aPlay(), payload: { description: 'x' } }),
    )
    const submitSpy = vi
      .spyOn(api, 'submitGuess')
      .mockResolvedValue(announced({ me: aPlay({ guessedAt: '2026-08-14T12:00:00Z', points: 1 }) }))
    const { Cmp, round } = host()

    mount(Cmp)
    await flushPromises()

    await round().submit({ hue: 1 })

    expect(submitSpy).toHaveBeenCalledWith('team', 12, { hue: 1 })
  })

  it('reloads instead of claiming an error on a 409', async () => {
    const reloadedRound = announced({ me: aPlay({ guessedAt: '2026-08-14T12:00:00Z', points: 1 }) })
    const getSpy = vi
      .spyOn(api, 'getCurrentRound')
      .mockResolvedValueOnce(announced())
      .mockResolvedValueOnce(reloadedRound)
    vi.spyOn(api, 'revealRound').mockResolvedValue(
      announced({ me: aPlay(), payload: { description: 'x' } }),
    )
    vi.spyOn(api, 'submitGuess').mockRejectedValue(new ApiError(409, 'conflict'))
    const { Cmp, round } = host()

    mount(Cmp)
    await flushPromises()

    await round().submit({ hue: 1 })

    expect(round().stage.value).toBe('done')
    expect(round().notice.value).not.toBeNull()
    expect(getSpy).toHaveBeenCalledTimes(2)
  })
})
