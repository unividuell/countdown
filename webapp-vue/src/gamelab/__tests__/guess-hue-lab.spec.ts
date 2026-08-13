import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import GuessHueLabGame from '@/gamelab/GuessHueLabGame.vue'
import GuessHueReveal from '@/games/guesshue/GuessHueReveal.vue'
import type { GuessHuePayload } from '@/gamelab/types'

const PAYLOAD: GuessHuePayload = {
  description: 'Testbeschreibung einer Farbe.',
  initHue: 210.4,
  saturation: 0.6,
  lightness: 0.45,
}

function mountAdapter(props: Record<string, unknown> = {}) {
  return mount(GuessHueLabGame, {
    props: {
      payload: PAYLOAD,
      outcome: null,
      disabled: false,
      myGuess: null,
      solution: null,
      entries: [],
      mineUserId: null,
      ...props,
    },
  })
}

describe('GuessHueLabGame', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('starts the wheel on the payload angle while nothing has been guessed', () => {
    const w = mountAdapter()

    expect(w.get('[data-test="hue-wheel"]').attributes('aria-valuenow')).toBe('210')
  })

  it('starts the wheel on my own guess once there is one', () => {
    // After a reload the payload still carries the starting angle; showing it would misreport a
    // round that is already spent.
    const w = mountAdapter({ myGuess: { hue: 42.5 }, disabled: true })

    expect(w.get('[data-test="hue-wheel"]').attributes('aria-valuenow')).toBe('43')
  })

  it("follows a round change from the old payload's angle to the new one's", async () => {
    // The lab page keeps this instance mounted for as long as the response for a rolled seed
    // hasn't landed yet, so the wheel keeps showing the *old* round's angle right up to the
    // moment the new props actually arrive — this is what a mid-race screenshot would show.
    const w = mountAdapter()
    expect(w.get('[data-test="hue-wheel"]').attributes('aria-valuenow')).toBe('210')

    await w.setProps({ payload: { ...PAYLOAD, initHue: 60.2 } })

    expect(w.get('[data-test="hue-wheel"]').attributes('aria-valuenow')).toBe('60')
  })

  it('sends the angle as the guess the backend expects', async () => {
    const w = mountAdapter()
    await w.vm.$nextTick()

    await w.get('[data-test="hold-button"]').trigger('pointerdown', { isPrimary: true })
    vi.advanceTimersByTime(2000)

    expect(w.emitted('guess')).toEqual([[{ hue: 210.4 }]])
  })

  it('survives a guess shape it does not recognise', () => {
    // `myGuess` is `unknown` by contract; a stale round from another game must not throw.
    const w = mountAdapter({ myGuess: { value: 7 }, disabled: true })

    expect(w.get('[data-test="hue-wheel"]').attributes('aria-valuenow')).toBe('210')
  })

  it.each([
    ['NaN', { hue: NaN }],
    ['Infinity', { hue: Infinity }],
    ['a string', { hue: '214' }],
  ])('falls back to the payload angle for a %s guess value', (_label, myGuess) => {
    // `typeof` alone lets `NaN` through, and the `?? payload.initHue` fallback only catches
    // null/undefined — a non-finite or wrongly-typed value on the right key must still fall back.
    const w = mountAdapter({ myGuess, disabled: true })

    expect(w.get('[data-test="hue-wheel"]').attributes('aria-valuenow')).toBe('210')
  })

  it('pins the beat-1 seam: the same class name on both sides of the Transition', () => {
    // happy-dom computes no CSS, and vue-test-utils stubs <Transition> itself by default, so no
    // test here can see the button actually leave before the card behind it does. What can be
    // pinned is the seam three files have to agree on without anything checking it: the leave
    // class the adapter's <Transition> names, the group the board's root carries so a
    // Tailwind `group-[…]` selector has something to key off, and the centre wrapper's own
    // classes that reference it. Rename or reorder any one of the three and beat 1 silently stops
    // happening with every other test in this suite still green.
    const w = mountAdapter()

    expect(w.get('transition-stub').attributes('leaveactiveclass')).toContain('hue-card-leaving')

    const board = w.get('[data-test="hue-description"]').element.closest('.group')
    expect(board).not.toBeNull()

    const centreWrapper = w.get('[class*="hue-card-leaving"]')
    expect(centreWrapper.classes().some((c) => c.includes('hue-card-leaving'))).toBe(true)
  })

  it("keeps the input card in the crossfade's shared grid cell", () => {
    // Both cards need `[grid-area:1/1]` so the surroundings stay as tall as the taller card
    // during the switch — losing it on either one would stack the cards vertically instead.
    const board = mountAdapter().get('[data-test="hue-description"]').element.closest('.group')!

    expect(board.className).toContain('[grid-area:1/1]')
  })
})

const SOLUTION = { targetHue: 210, toleranceDeg: 10 }

function entry(userId: string, hue: unknown, bgColorHex = '#3366cc') {
  return {
    userId,
    username: userId,
    avatar: { shortName: userId.toUpperCase(), bgColorHex },
    guess: { hue },
    outcome: null,
    at: '2026-08-09T12:00:00Z',
  }
}

describe('GuessHueLabGame, once the round is spent', () => {
  // A sibling `describe`, so the reduced-motion stub above does NOT reach these — that stub would
  // make "does not replay the reveal" pass for the wrong reason. Fake frames only, so the beats
  // stay under the test's control.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('turns into the reading wheel as soon as the server reveals the solution', () => {
    const w = mountAdapter({
      solution: SOLUTION,
      entries: [entry('me', 214.5)],
      mineUserId: 'me',
      myGuess: { hue: 214.5 },
      disabled: true,
    })

    expect(w.find('[data-test="hue-wheel-reveal"]').exists()).toBe(true)
    expect(w.find('[data-test="hue-wheel"]').exists()).toBe(false)
    // The input card's rule belongs to the input card.
    expect(w.find('[data-test="hue-hint"]').exists()).toBe(false)
    // The quote stays — it is what the picture is about.
    expect(w.get('[data-test="hue-description"]').text()).toBe('„Testbeschreibung einer Farbe.“')
  })

  it('goes back to the input card when the guess is deleted', async () => {
    const w = mountAdapter({
      solution: SOLUTION,
      entries: [entry('me', 214.5)],
      mineUserId: 'me',
      disabled: true,
    })

    await w.setProps({ solution: null, entries: [], mineUserId: null, disabled: false })

    expect(w.find('[data-test="hue-wheel"]').exists()).toBe(true)
    expect(w.find('[data-test="hue-wheel-reveal"]').exists()).toBe(false)
  })

  it.each([
    ['null', null],
    ['a number', 7],
    ['an empty object', {}],
    ['a non-numeric target', { targetHue: 'blau', toleranceDeg: 10 }],
    ['a non-finite target', { targetHue: NaN, toleranceDeg: 10 }],
    ['a missing tolerance', { targetHue: 210 }],
    ['a non-finite tolerance', { targetHue: 210, toleranceDeg: Infinity }],
  ])('leaves the input card standing for %s', (_label, solution) => {
    // `solution` is `unknown` by contract; junk must not put NaN into a transformation matrix.
    const w = mountAdapter({ solution, entries: [entry('me', 214.5)], mineUserId: 'me' })

    expect(w.find('[data-test="hue-wheel"]').exists()).toBe(true)
    expect(w.find('[data-test="hue-wheel-reveal"]').exists()).toBe(false)
  })

  it('reveals in phase two, where there is no tolerance window', async () => {
    const w = mountAdapter({ solution: { targetHue: 210, toleranceDeg: null } })

    // The reveal card must mount: the round is over for this viewer, and a null window is a real
    // answer ("no gate"), not a broken payload.
    expect(w.findComponent(GuessHueReveal).exists()).toBe(true)
    expect(w.findComponent(GuessHueReveal).props('toleranceDeg')).toBe(0)
  })

  it('draws one marker per usable entry', () => {
    const w = mountAdapter({
      solution: SOLUTION,
      entries: [entry('me', 214.5), entry('a', 40, '#cc3366'), entry('b', 300, '#33cc66')],
      mineUserId: 'me',
      disabled: true,
    })

    expect(w.findAll('[data-test="hue-marker"]')).toHaveLength(3)
  })

  it('shows the reveal card with no markers at all when a valid solution has no usable entries', () => {
    const w = mountAdapter({ solution: SOLUTION, entries: [], mineUserId: null, disabled: true })

    expect(w.find('[data-test="hue-wheel-reveal"]').exists()).toBe(true)
    expect(w.findAll('[data-test="hue-marker"]')).toHaveLength(0)
  })

  it("keeps the reveal card in the crossfade's shared grid cell", () => {
    const w = mountAdapter({ solution: SOLUTION, entries: [], mineUserId: null, disabled: true })
    const revealCard = w.get('[data-test="hue-wheel-reveal"]').element.closest('.rounded-xl')!

    expect(revealCard.className).toContain('[grid-area:1/1]')
  })

  it.each([
    ['a non-finite angle', entry('bad', NaN)],
    ['a string angle', entry('bad', '214')],
    ['no angle at all', { ...entry('bad', 0), guess: {} }],
    ['a guess from another game', { ...entry('bad', 0), guess: { value: 7 } }],
    ['no guess object', { ...entry('bad', 0), guess: null }],
  ])('drops an entry with %s instead of drawing it', (_label, bad) => {
    const w = mountAdapter({
      solution: SOLUTION,
      entries: [entry('me', 214.5), bad],
      mineUserId: 'me',
      disabled: true,
    })

    expect(w.findAll('[data-test="hue-marker"]')).toHaveLength(1)
  })

  it('plays the reveal for the guess that just landed', async () => {
    // The other direction from the reload below: this instance watched the round flip, so the
    // others are still waiting behind their delay — no frame has run to start the beats.
    const w = mountAdapter()

    await w.setProps({
      solution: SOLUTION,
      entries: [entry('me', 214.5), entry('a', 40, '#cc3366')],
      mineUserId: 'me',
      disabled: true,
    })

    expect(w.find('[data-test="hue-wheel-reveal"]').exists()).toBe(true)
    expect(w.findAll('[data-test="hue-marker"]')[1]!.classes()).toContain('opacity-0')
  })

  it('does not replay the reveal for someone reloading a spent round', () => {
    // Suspense belongs to the moment of the guess, not to the load. Mounted straight into the
    // reveal means there was no moment to build up to.
    const w = mountAdapter({
      solution: SOLUTION,
      entries: [entry('me', 214.5), entry('a', 40, '#cc3366')],
      mineUserId: 'me',
      disabled: true,
    })

    expect(w.findAll('[data-test="hue-marker"]')[1]!.classes()).toContain('opacity-100')
  })

  it('re-arms the reveal after a delete-and-reguess cycle in the same instance', async () => {
    // The lab page keys the game component on `round.seed`, not on whether a guess exists, so the
    // same instance can cross the revealed boundary twice: reload into a spent round (no live
    // transition — the picture above pins that state), delete the guess, guess again. The second
    // crossing is a live transition just like the first would have been, and must get its own
    // choreography rather than the reload's finished-picture treatment.
    const w = mountAdapter({
      solution: SOLUTION,
      entries: [entry('me', 214.5), entry('a', 40, '#cc3366')],
      mineUserId: 'me',
      disabled: true,
    })
    expect(w.find('[data-test="hue-wheel-reveal"]').exists()).toBe(true)
    expect(w.findAll('[data-test="hue-marker"]')[1]!.classes()).toContain('opacity-100')

    await w.setProps({ solution: null, entries: [], mineUserId: null, disabled: false })
    expect(w.find('[data-test="hue-wheel"]').exists()).toBe(true)

    await w.setProps({
      solution: SOLUTION,
      entries: [entry('me', 214.5), entry('a', 40, '#cc3366')],
      mineUserId: 'me',
      disabled: true,
    })
    expect(w.find('[data-test="hue-wheel-reveal"]').exists()).toBe(true)
    expect(w.findAll('[data-test="hue-marker"]')[1]!.classes()).toContain('opacity-0')
  })
})
