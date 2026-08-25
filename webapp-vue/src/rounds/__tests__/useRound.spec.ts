import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { ApiError } from '@/api/client'
import * as api from '@/api/rounds'
import type { MyPlayDto, RoundResponse } from '@/api/types'
import { useRound } from '../useRound'

const announced = (over: Partial<RoundResponse> = {}): RoundResponse => ({
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

const aPlay = (over: Partial<MyPlayDto> = {}): MyPlayDto => ({
  userId: 'u1',
  username: 'Fry',
  avatar: { shortName: 'FRY', bgColorHex: '#bf40b3' },
  stage: 0,
  revealedAt: '2026-08-14T11:00:00Z',
  guessedAt: null,
  guess: null,
  outcome: null,
  points: null,
  durationMs: null,
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

  it('sends the round number and the believed stage on skip', async () => {
    vi.spyOn(api, 'getCurrentRound').mockResolvedValue(announced())
    vi.spyOn(api, 'revealRound').mockResolvedValue(
      announced({ me: aPlay(), payload: { description: 'x' } }),
    )
    const skipSpy = vi
      .spyOn(api, 'skipStage')
      .mockResolvedValue(announced({ me: aPlay({ stage: 1 }) }))
    const { Cmp, round } = host()

    mount(Cmp)
    await flushPromises()

    await round().skip(0)

    expect(skipSpy).toHaveBeenCalledWith('team', 12, 0)
  })

  it('sends the round number on give-up', async () => {
    vi.spyOn(api, 'getCurrentRound').mockResolvedValue(announced())
    vi.spyOn(api, 'revealRound').mockResolvedValue(
      announced({ me: aPlay(), payload: { description: 'x' } }),
    )
    const giveUpSpy = vi
      .spyOn(api, 'giveUpRound')
      .mockResolvedValue(announced({ me: aPlay({ guessedAt: '2026-08-14T12:00:00Z', points: 0 }) }))
    const { Cmp, round } = host()

    mount(Cmp)
    await flushPromises()

    await round().giveUp()

    expect(giveUpSpy).toHaveBeenCalledWith('team', 12)
    expect(round().stage.value).toBe('done')
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

  it('reveals again after a 409 lands a new round, not just refetches it', async () => {
    // The day-boundary case the round-number envelope exists for: a 409 on `submit` means the
    // round the client believed it was playing is gone, and the refetch lands the *next* round —
    // with `me: null` again, exactly like the first landing. A `requiresReveal: false` game must
    // get the same implicit reveal here that it got on mount, or the player is stranded on
    // `no-game`'s fallback ("Und jetzt viel Spaß zusammen!") in front of a live, playable round.
    const nextRound = {
      number: 13,
      label: 'T-13',
      start: '2026-08-15T10:00:00Z',
      end: '2026-08-16T10:00:00Z',
    }
    vi.spyOn(api, 'getCurrentRound')
      .mockResolvedValueOnce(announced())
      .mockResolvedValueOnce(announced({ round: nextRound }))
    const revealSpy = vi
      .spyOn(api, 'revealRound')
      .mockResolvedValueOnce(announced({ me: aPlay(), payload: { description: 'x' } }))
      .mockResolvedValueOnce(
        announced({ round: nextRound, me: aPlay(), payload: { description: 'y' } }),
      )
    vi.spyOn(api, 'submitGuess').mockRejectedValue(new ApiError(409, 'conflict'))
    const { Cmp, round } = host()

    mount(Cmp)
    await flushPromises()

    await round().submit({ hue: 1 })

    expect(revealSpy).toHaveBeenCalledTimes(2)
    expect(round().round.value?.round?.number).toBe(13)
    expect(round().stage.value).toBe('playing')
  })

  it('marks the load failed when the round cannot be fetched', async () => {
    vi.spyOn(api, 'getCurrentRound').mockRejectedValue(new Error('network down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { Cmp, round } = host()

    mount(Cmp)
    await flushPromises()

    expect(round().state.value).toBe('failed')
  })

  it('offers no play affordance when a viewer with no row cannot even open an implicit reveal', async () => {
    // The super-admin bypass can hand back a game with `me: null`, but `PlayService.playable`
    // always resolves as a plain member — so the implicit reveal this viewer's `requiresReveal:
    // false` game triggers 404s. The viewer must not be left on `sealed`: there is no
    // game-mandated reveal for them to click through.
    vi.spyOn(api, 'getCurrentRound').mockResolvedValue(announced())
    vi.spyOn(api, 'revealRound').mockRejectedValue(new ApiError(404, 'not found'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { Cmp, round } = host()

    mount(Cmp)
    await flushPromises()

    expect(round().state.value).toBe('failed')
    expect(round().stage.value).toBe('no-game')
  })

  it('offers a plain retry instead of reloading on a non-409 failure', async () => {
    const getSpy = vi.spyOn(api, 'getCurrentRound').mockResolvedValue(announced())
    vi.spyOn(api, 'revealRound').mockResolvedValue(
      announced({ me: aPlay(), payload: { description: 'x' } }),
    )
    vi.spyOn(api, 'submitGuess').mockRejectedValue(new Error('network down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { Cmp, round } = host()

    mount(Cmp)
    await flushPromises()
    getSpy.mockClear()

    await round().submit({ hue: 1 })

    expect(round().notice.value).toBe('Das hat nicht funktioniert. Versuch es nochmal.')
    // The distinguishing half: a non-409 failure must not trigger the 409 branch's reload.
    expect(getSpy).not.toHaveBeenCalled()
  })
})
