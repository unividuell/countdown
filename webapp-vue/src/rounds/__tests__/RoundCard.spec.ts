import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount, type VueWrapper } from '@vue/test-utils'
import type { MyPlayDto, OtherPlayDto, RoundResponse } from '@/api/types'
import type { RoundStage } from '@/rounds/useRound'
import RoundCard from '@/rounds/RoundCard.vue'
import GameHeader from '@/ui/GameHeader.vue'
import { _resetSharedClock } from '@/ui/sharedClock'

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
        awardRule: { type: String, default: null },
        stage: { type: Number, default: 0 },
        assetUrl: { type: Function, default: null },
        tipPath: { type: Function, default: null },
        closed: { type: Boolean, default: false },
      },
      emits: ['guess', 'skip', 'give-up'],
      template:
        '<button data-test="stub-guess" @click="$emit(\'guess\', 123)">guess</button>' +
        '<button data-test="stub-skip" @click="$emit(\'skip\', 1)">skip</button>' +
        '<button data-test="stub-give-up" @click="$emit(\'give-up\')">give up</button>',
    }),
  }
})

vi.mock('@/games/registry', () => ({ gameComponents: { 'guess-hue': StubGame } }))

const anOther = (over: Partial<OtherPlayDto> = {}): OtherPlayDto => ({
  userId: 'o1',
  username: 'Leela',
  avatar: { shortName: 'LEE', bgColorHex: '#40bf7a' },
  stage: 0,
  guess: null,
  outcome: null,
  points: null,
  durationMs: null,
  votes: [],
  struck: false,
  adminOverride: null,
  ...over,
})

const aPlay = (over: Partial<MyPlayDto> = {}): MyPlayDto => ({
  ...anOther({ userId: 'me', username: 'Fry' }),
  avatar: { shortName: 'FRY', bgColorHex: '#bf40b3' },
  revealedAt: '2026-08-14T11:00:00Z',
  guessedAt: null,
  ...over,
})

const aRound = (over: Partial<RoundResponse> = {}): RoundResponse => ({
  round: { number: 12, label: 'T-12', start: '2026-08-14T10:00:00Z', end: '2026-08-15T10:00:00Z' },
  game: { id: 'guess-hue', displayName: 'Farbausmalung', requiresReveal: true },
  noGameReason: null,
  previousRoundNumber: null,
  payload: { description: 'x' },
  solution: null,
  me: null,
  others: [],
  awardRule: null,
  awardPoints: null,
  canOverride: false,
  ...over,
})

function mountCard(props: {
  round: RoundResponse | null
  /** Omitted for a closed round: it has no stage left to derive a face from. */
  stage?: RoundStage
  closed?: boolean
  busy?: boolean
  notice?: string | null
  reveal?: () => Promise<void>
  submit?: (guess: unknown) => Promise<void>
  skip?: (fromStage: number) => Promise<void>
  giveUp?: () => Promise<void>
  assetUrl?: (key: number) => string
  tipPath?: (userId: string) => string
}): VueWrapper {
  return mount(RoundCard, {
    props: {
      busy: false,
      notice: null,
      reveal: vi.fn().mockResolvedValue(undefined),
      submit: vi.fn().mockResolvedValue(undefined),
      skip: vi.fn().mockResolvedValue(undefined),
      giveUp: vi.fn().mockResolvedValue(undefined),
      assetUrl: vi.fn().mockReturnValue('https://example.invalid/asset'),
      tipPath: vi.fn().mockReturnValue('https://example.invalid/tip'),
      ...props,
    },
  })
}

// The header band subscribes to the shared clock for as long as it is mounted, so every card this
// spec mounts has to be released again — otherwise one interval per test case survives the case.
enableAutoUnmount(afterEach)
afterEach(_resetSharedClock)

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

  it("hands the round's award rule to the game", () => {
    // The game needs it to say whether a score can still be overtaken. The rule travels, not a
    // pre-chewed boolean: `RoundResponse` publishes it so the UI has exactly one reading of it.
    const me = aPlay({ guessedAt: '2026-08-14T12:00:00Z', points: 1 })
    const round = aRound({ me, awardRule: 'CLOSEST_ONLY', awardPoints: 2 })

    const stub = mountCard({ round, stage: 'done' }).findComponent(StubGame)

    expect(stub.props('awardRule')).toBe('CLOSEST_ONLY')
  })

  it("hands the game its own stage and the round's asset-url builder", () => {
    const assetUrl = vi.fn().mockReturnValue('https://example.invalid/asset/7')
    const round = aRound({ me: aPlay({ stage: 2 }) })
    const stub = mountCard({ round, stage: 'playing', assetUrl }).findComponent(StubGame)

    expect(stub.props('stage')).toBe(2)
    expect(stub.props('assetUrl')).toBe(assetUrl)
  })

  it("hands the game the round's tip-path builder", () => {
    const tipPath = vi.fn().mockReturnValue('/c/team/rounds/12/tips/u1')
    const round = aRound({ me: aPlay() })
    const stub = mountCard({ round, stage: 'playing', tipPath }).findComponent(StubGame)

    expect(stub.props('tipPath')).toBe(tipPath)
  })

  // `<component :is>` on a `Component`-typed value is not prop-checked by vue-tsc (see the
  // task-15 report) — a test is the only thing that would catch this binding going missing.
  // Weltanschauung reads it: a closed round shows its tips to every viewer, played or not.
  it('tells the game the round is closed', () => {
    const round = aRound({ me: aPlay() })

    expect(mountCard({ round, closed: true }).findComponent(StubGame).props('closed')).toBe(true)
    expect(mountCard({ round, stage: 'playing' }).findComponent(StubGame).props('closed')).toBe(
      false,
    )
  })

  // The anchor the single-tip page's close control comes back to. Without it that control lands at
  // the top of the community page and the reader has lost their place in the history.
  it('anchors itself under its own round number', () => {
    const w = mountCard({ round: aRound(), stage: 'playing' })

    expect(w.get('[data-test="round-card"]').attributes('id')).toBe('round-12')
  })

  it('reaches skip and give-up through to the callbacks the page supplied', async () => {
    const skip = vi.fn().mockResolvedValue(undefined)
    const giveUp = vi.fn().mockResolvedValue(undefined)
    const round = aRound({ me: aPlay() })
    const w = mountCard({ round, stage: 'playing', skip, giveUp })

    await w.get('[data-test="stub-skip"]').trigger('click')
    expect(skip).toHaveBeenCalledWith(1)

    await w.get('[data-test="stub-give-up"]').trigger('click')
    expect(giveUp).toHaveBeenCalledOnce()
  })

  it('shows the result once the viewer has guessed', () => {
    const me = aPlay({ guessedAt: '2026-08-14T12:00:00Z', guess: { hue: 7 }, points: 1 })
    const other = anOther({ guess: { hue: 3 } })
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

  it('draws every face on one shared surface', () => {
    const w = mountCard({ round: aRound(), stage: 'playing' })

    expect(w.findAll('[data-test="round-surface"]')).toHaveLength(1)
    expect(
      w.get('[data-test="stub-guess"]').element.closest('[data-test="round-surface"]'),
    ).not.toBeNull()
  })

  it('puts the sealed face on that same surface', () => {
    const w = mountCard({ round: aRound(), stage: 'sealed' })

    expect(w.findAll('[data-test="round-surface"]')).toHaveLength(1)
    expect(
      w.get('[data-test="round-reveal"]').element.closest('[data-test="round-surface"]'),
    ).not.toBeNull()
  })

  it('puts the unrenderable face on that same surface', () => {
    const round = aRound({
      game: { id: 'unknown-game', displayName: 'Rätselraten', requiresReveal: false },
      me: aPlay(),
    })
    const w = mountCard({ round, stage: 'playing' })

    expect(w.findAll('[data-test="round-surface"]')).toHaveLength(1)
    expect(
      w.get('[data-test="round-unrenderable"]').element.closest('[data-test="round-surface"]'),
    ).not.toBeNull()
  })

  // The notice is about the attempt, not about the round on the board: it belongs above the
  // surface, where it does not move the board down inside its own frame.
  it('keeps the notice outside the surface', () => {
    const w = mountCard({ round: aRound(), stage: 'playing', notice: 'Zu spät.' })

    expect(
      w.get('[data-test="round-notice"]').element.closest('[data-test="round-surface"]'),
    ).toBeNull()
  })

  it('hands the band the round it is drawing, not a countdown of its own', () => {
    const round = aRound()
    const band = mountCard({ round, stage: 'playing' }).getComponent(GameHeader)

    expect(band.props('roundNumber')).toBe(12)
    expect(band.props('title')).toBe('Farbausmalung')
    expect(band.props('endsAt')).toBe('2026-08-15T10:00:00Z')
  })

  // Every face of the card is the same round of the same game for the same time, so the band is
  // the card's, not any one face's — a band per face is four places for it to disagree.
  it.each<RoundStage>(['sealed', 'playing', 'done'])('carries the band on the %s face', (stage) => {
    const round = aRound({
      me: stage === 'sealed' ? null : aPlay({ guessedAt: stage === 'done' ? 'x' : null }),
    })

    expect(mountCard({ round, stage }).findComponent(GameHeader).exists()).toBe(true)
  })

  it('carries the band even where this build cannot render the game', () => {
    const round = aRound({
      game: { id: 'unknown-game', displayName: 'Rätselraten', requiresReveal: false },
      me: aPlay(),
    })

    expect(mountCard({ round, stage: 'playing' }).findComponent(GameHeader).exists()).toBe(true)
  })

  it('puts the band in the surface header, so it reaches both card edges', () => {
    const w = mountCard({ round: aRound(), stage: 'playing' })
    const band = w.get('[data-test="game-header"]').element

    expect(band.closest('[data-test="round-surface"]')).not.toBeNull()
    expect(band.closest('[data-test="round-surface-body"]')).toBeNull()
  })

  // The band names the game now, so the sealed face saying it again is one name too many — and two
  // places to fix when a display name changes.
  it('names the game exactly once while sealed', () => {
    const w = mountCard({ round: aRound(), stage: 'sealed' })

    expect(w.text().match(/Farbausmalung/g)).toHaveLength(1)
  })

  it('names the game exactly once where there is no renderer for it', () => {
    const round = aRound({
      game: { id: 'unknown-game', displayName: 'Rätselraten', requiresReveal: false },
      me: aPlay(),
    })
    const w = mountCard({ round, stage: 'playing' })

    expect(w.text().match(/Rätselraten/g)).toHaveLength(1)
  })

  // `round` is nullable on the response, and a band cannot invent a number for a round that is not
  // there — but a game with no renderer still deserves its name.
  it('survives a game without a round', () => {
    const round = aRound({ round: null, me: aPlay() })
    const band = mountCard({ round, stage: 'playing' }).getComponent(GameHeader)

    expect(band.props('roundNumber')).toBeNull()
    expect(band.props('endsAt')).toBeNull()
  })

  it('shows a closed round as its reveal, without a clock and without an action', () => {
    const me = aPlay({ guessedAt: '2026-08-14T12:00:00Z', guess: { hue: 7 }, points: 1 })
    const round = aRound({
      me,
      others: [anOther({ guess: { hue: 3 } })],
      solution: { targetHue: 5 },
    })

    const w = mount(RoundCard, {
      props: {
        round,
        closed: true,
        assetUrl: (key: number) => `/assets/${key}`,
        tipPath: (userId: string) => `/tips/${userId}`,
      },
    })

    const stub = w.findComponent(StubGame)
    expect(stub.props('solution')).toEqual(round.solution)
    expect(stub.props('disabled')).toBe(true)
    // No clock: a closed round's countdown would read 00:00:00 forever.
    expect(w.findComponent(GameHeader).props('endsAt')).toBe(null)
    expect(w.find('[data-test="round-reveal"]').exists()).toBe(false)
  })

  it('shows a closed round the viewer never played', () => {
    const other = anOther({ guess: { hue: 3 }, points: 1 })
    const round = aRound({ me: null, others: [other], solution: { targetHue: 5 } })

    const stub = mount(RoundCard, {
      props: {
        round,
        closed: true,
        assetUrl: (key: number) => `/assets/${key}`,
        tipPath: (userId: string) => `/tips/${userId}`,
      },
    }).findComponent(StubGame)

    expect(stub.exists()).toBe(true)
    expect(stub.props('entries')).toEqual([other])
  })

  it('says what the reveal costs before it is clicked', () => {
    const w = mountCard({ round: aRound(), stage: 'sealed' })

    const notice = w.get('[data-test="round-reveal-cost"]').text()
    expect(notice).toContain('Zeit')
    expect(notice).toContain('einen Versuch')
  })

  it('says nothing about a clock on a round that is being played', () => {
    const w = mountCard({ round: aRound({ me: aPlay() }), stage: 'playing' })

    expect(w.find('[data-test="round-reveal-cost"]').exists()).toBe(false)
  })
})
