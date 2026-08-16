import { describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import type { PlayDto, RoundResponse } from '@/api/types'
import type { RoundStage } from '@/rounds/useRound'
import RoundCard from '@/rounds/RoundCard.vue'

/**
 * A stub, not `guess-hue`: this test exercises the card's own wiring — which prop the game gets,
 * which callback a click reaches — without depending on any particular game's rendering. `vi.hoisted`
 * because `vi.mock` below is hoisted above every import, so a plain module-scope constant would not
 * be initialised yet when the mock factory runs (same trap as `src/gamelab/__tests__/lab-page.spec.ts`).
 */
const { StubGame } = await vi.hoisted(async () => {
  const { defineComponent } = await import('vue')
  return {
    StubGame: defineComponent({
      name: 'StubGame',
      props: {
        payload: { type: null, default: null },
        outcome: { type: null, default: null },
        myGuess: { type: null, default: null },
        solution: { type: null, default: null },
        entries: { type: Array, default: () => [] },
        mineUserId: { type: String, default: null },
        disabled: { type: Boolean, default: false },
      },
      emits: ['guess'],
      template: '<button data-test="stub-guess" @click="$emit(\'guess\', 123)">guess</button>',
    }),
  }
})

vi.mock('@/games/registry', () => ({ gameComponents: { 'guess-hue': StubGame } }))

const aPlay = (over: Partial<PlayDto> = {}): PlayDto => ({
  userId: 'me',
  username: 'Fry',
  avatar: { shortName: 'FRY', bgColorHex: '#bf40b3' },
  revealedAt: '2026-08-14T11:00:00Z',
  guessedAt: null,
  guess: null,
  outcome: null,
  points: null,
  ...over,
})

const aRound = (over: Partial<RoundResponse> = {}): RoundResponse => ({
  round: { number: 12, label: 'T-12', start: '2026-08-14T10:00:00Z', end: '2026-08-15T10:00:00Z' },
  game: { id: 'guess-hue', displayName: 'Farbausmalung', requiresReveal: true },
  noGameReason: null,
  payload: { description: 'x' },
  solution: null,
  me: null,
  others: [],
  awardRule: null,
  awardPoints: null,
  ...over,
})

function mountCard(props: {
  round: RoundResponse | null
  stage: RoundStage
  busy?: boolean
  notice?: string | null
  reveal?: () => Promise<void>
  submit?: (guess: unknown) => Promise<void>
}): VueWrapper {
  return mount(RoundCard, {
    props: {
      busy: false,
      notice: null,
      reveal: vi.fn().mockResolvedValue(undefined),
      submit: vi.fn().mockResolvedValue(undefined),
      ...props,
    },
  })
}

describe('RoundCard', () => {
  it('shows the game and a reveal button while the round is sealed', async () => {
    const reveal = vi.fn().mockResolvedValue(undefined)
    const w = mountCard({ round: aRound(), stage: 'sealed', reveal })

    expect(w.find('[data-test="round-reveal"]').exists()).toBe(true)
    expect(w.findComponent(StubGame).exists()).toBe(false)

    await w.get('[data-test="round-reveal"]').trigger('click')
    expect(reveal).toHaveBeenCalledOnce()
  })

  it('hands the game its payload once the round is open', async () => {
    const submit = vi.fn().mockResolvedValue(undefined)
    const round = aRound({ me: aPlay({ guess: { hue: 7 } }) })
    const w = mountCard({ round, stage: 'playing', submit })

    const stub = w.findComponent(StubGame)
    expect(stub.exists()).toBe(true)
    expect(stub.props('payload')).toEqual(round.payload)
    expect(stub.props('myGuess')).toEqual({ hue: 7 })
    expect(stub.props('disabled')).toBe(false)

    await stub.get('[data-test="stub-guess"]').trigger('click')
    expect(submit).toHaveBeenCalledWith(123)
  })

  it('shows the result once the viewer has guessed', () => {
    const me = aPlay({ guessedAt: '2026-08-14T12:00:00Z', guess: { hue: 7 }, points: 1 })
    const other = aPlay({ userId: 'o1', guessedAt: '2026-08-14T12:00:00Z', guess: { hue: 3 } })
    const round = aRound({
      me,
      others: [other],
      solution: { targetHue: 5, toleranceDeg: 10 },
    })
    const w = mountCard({ round, stage: 'done' })

    const stub = w.findComponent(StubGame)
    expect(stub.props('solution')).toEqual(round.solution)
    expect(stub.props('entries')).toEqual([me, other])
    expect(stub.props('disabled')).toBe(true)
  })

  // The card says nothing about points in prose: the member row's live badge already shows the
  // score, and it appears exactly when the viewer has guessed. See the design doc's addendum.
  it('leaves the score to the member row instead of restating it', () => {
    const me = aPlay({ guessedAt: '2026-08-14T12:00:00Z', points: 0 })
    const round = aRound({ me, awardRule: 'CLOSEST_ONLY', awardPoints: 2 })
    const w = mountCard({ round, stage: 'done' })

    expect(w.text()).not.toMatch(/Punkt/)
  })

  it('shows no notice line when nothing went wrong', () => {
    const w = mountCard({ round: aRound(), stage: 'sealed', notice: null })
    expect(w.find('[data-test="round-notice"]').exists()).toBe(false)
  })

  it('emits guessed so the page can refresh the standings', async () => {
    const submit = vi.fn().mockResolvedValue(undefined)
    const round = aRound({ me: aPlay() })
    const w = mountCard({ round, stage: 'playing', notice: null, submit })

    await w.findComponent(StubGame).get('[data-test="stub-guess"]').trigger('click')
    expect(w.emitted('guessed')).toBeTruthy()
  })

  it('does not emit guessed when the guess did not go through', async () => {
    const round = aRound({ me: aPlay() })
    const submit = vi.fn()
    const w = mountCard({ round, stage: 'playing', notice: null, submit })
    // Simulates what the real `useRound` does on a failed/raced submit: it resolves without
    // throwing and sets `notice` instead — the card must read that, not a rejected promise.
    submit.mockImplementation(async () => {
      await w.setProps({ notice: 'Das hat nicht funktioniert. Versuch es nochmal.' })
    })

    await w.findComponent(StubGame).get('[data-test="stub-guess"]').trigger('click')
    expect(w.emitted('guessed')).toBeFalsy()
  })

  it('shows the notice when the server refused', () => {
    const w = mountCard({
      round: aRound(),
      stage: 'sealed',
      notice: 'Die Runde hat sich geändert — hier ist der aktuelle Stand.',
    })
    expect(w.get('[data-test="round-notice"]').text()).toContain('aktuelle Stand')
  })

  it('says so when no renderer is registered for the announced game', () => {
    const round = aRound({
      game: { id: 'unknown-game', displayName: 'Rätselraten', requiresReveal: false },
      me: aPlay(),
    })
    const w = mountCard({ round, stage: 'playing' })

    expect(w.find('[data-test="round-unrenderable"]').exists()).toBe(true)
    expect(w.findComponent(StubGame).exists()).toBe(false)
  })

  // A missing renderer is exactly as unrenderable while sealed as while playing — offering
  // "Aufdecken" first and admitting the gap only once revealed would be the same lie, one step
  // later.
  it('says so instead of offering a reveal when the sealed game has no renderer', () => {
    const round = aRound({
      game: { id: 'unknown-game', displayName: 'Rätselraten', requiresReveal: true },
    })
    const w = mountCard({ round, stage: 'sealed' })

    expect(w.find('[data-test="round-unrenderable"]').exists()).toBe(true)
    expect(w.find('[data-test="round-reveal"]').exists()).toBe(false)
  })
})
