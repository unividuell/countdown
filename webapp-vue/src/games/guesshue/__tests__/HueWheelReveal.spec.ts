import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import HueWheelReveal from '@/games/guesshue/HueWheelReveal.vue'
import type { RevealGuess } from '@/games/guesshue/reveal'
import { KNOB_TRACK_FRACTION, trackBoxStyle } from '@/games/guesshue/wheel'

const GUESSES: RevealGuess[] = [
  { userId: 'me', hue: 214.5, colorHex: '#3366cc', revealDelayMs: 2000 },
  { userId: 'other', hue: 40, colorHex: '#cc3366', revealDelayMs: 2500 },
]

function mountWheel(props: Partial<InstanceType<typeof HueWheelReveal>['$props']> = {}) {
  return mount(HueWheelReveal, {
    props: {
      saturation: 0.6,
      lightness: 0.45,
      targetHue: 210,
      toleranceDeg: 10,
      guesses: GUESSES,
      mineUserId: 'me',
      animate: false,
      ...props,
    },
  })
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
}

describe('HueWheelReveal', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    setHidden(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    setHidden(false)
    vi.restoreAllMocks()
  })

  it("draws one marker per guess, in the guesser's own colour", () => {
    const w = mountWheel()
    const markers = w.findAll<HTMLElement>('[data-test="hue-marker"]')

    expect(markers).toHaveLength(2)
    // happy-dom may or may not normalise a hex to rgb() — the test pins the colour, not that.
    expect(markers[0]!.element.style.backgroundColor).toMatch(/#3366cc|rgb\(51, ?102, ?204\)/i)
    expect(markers[1]!.element.style.backgroundColor).toMatch(/#cc3366|rgb\(204, ?51, ?102\)/i)
  })

  it('gives every marker a white rim and no label, as the design states', () => {
    const w = mountWheel()

    for (const marker of w.findAll<HTMLElement>('[data-test="hue-marker"]')) {
      expect(marker.classes()).toEqual(expect.arrayContaining(['ring-2', 'ring-white']))
      expect(marker.text()).toBe('')
    }
  })

  it('does not style my own marker any differently from the others, beyond the fade', () => {
    // The design is explicit that mine is not highlighted — the choreography (it grows out of
    // the knob) says that more clearly than a special style would. `animate: true` makes the
    // opacity actually differ between mine and the rest, so filtering it out is what isolates
    // "everything else" rather than trivially comparing two already-identical lists.
    const w = mountWheel({ animate: true })
    const [mine, other] = w.findAll<HTMLElement>('[data-test="hue-marker"]')

    const withoutOpacity = (classes: string[]): string[] =>
      classes.filter((c) => !c.startsWith('opacity-')).sort()

    expect(withoutOpacity(mine!.classes())).toEqual(withoutOpacity(other!.classes()))
  })

  it('turns each marker to its own angle', () => {
    const rotators = mountWheel().findAll<HTMLElement>('[data-test="hue-marker-rotator"]')

    expect(rotators[0]!.element.style.transform).toBe('rotate(214.5deg)')
    expect(rotators[1]!.element.style.transform).toBe('rotate(40deg)')
  })

  it("lands my own marker exactly where the input wheel's knob stood", () => {
    // Not recomputed here: both go through `trackBoxStyle`, which is what makes the crossfade read
    // as one circle changing colour rather than two circles swapping places.
    const marker = mountWheel().findAll<HTMLElement>('[data-test="hue-marker"]')[0]!

    expect(marker.element.style.top).toBe(trackBoxStyle(KNOB_TRACK_FRACTION).top)
  })

  it('stacks a colliding guess inward without moving mine', () => {
    const w = mountWheel({
      guesses: [GUESSES[0]!, { userId: 'x', hue: 216, colorHex: '#111111', revealDelayMs: 0 }],
    })
    const markers = w.findAll<HTMLElement>('[data-test="hue-marker"]')

    expect(markers[0]!.element.style.top).toBe(trackBoxStyle(KNOB_TRACK_FRACTION).top)
    expect(markers[1]!.element.style.top).not.toBe(markers[0]!.element.style.top)
  })

  it('is one picture for a screen reader, with the solution and the window in its name', () => {
    const wheel = mountWheel().get('[data-test="hue-wheel-reveal"]')

    expect(wheel.attributes('role')).toBe('img')
    expect(wheel.attributes('aria-label')).toBe(
      'Farbrad mit allen Tipps. Die Lösung liegt bei Azurblau, 210 Grad; als richtig gilt 200 bis 220 Grad.',
    )
  })

  it('says only where the solution is when there is no window', () => {
    const wheel = mountWheel({ toleranceDeg: 0 }).get('[data-test="hue-wheel-reveal"]')

    expect(wheel.attributes('aria-label')).toBe(
      'Farbrad mit allen Tipps. Die Lösung liegt bei Azurblau, 210 Grad.',
    )
  })

  it('takes no input at all', () => {
    const w = mountWheel()

    expect(w.find('[role="slider"]').exists()).toBe(false)
    expect(w.get('[data-test="hue-wheel-reveal"]').attributes('tabindex')).toBeUndefined()
    expect(w.find('[data-test="hue-knob"]').exists()).toBe(false)
  })

  it('draws the window and the solution as separate paths', () => {
    const w = mountWheel()

    expect(w.find('[data-test="hue-sector-window"]').exists()).toBe(true)
    expect(w.get('[data-test="hue-sector-solution"]').attributes('d')).toContain('M ')
  })

  it('draws only the solution line at zero tolerance', () => {
    const w = mountWheel({ toleranceDeg: 0 })

    expect(w.find('[data-test="hue-sector-window"]').exists()).toBe(false)
    expect(w.find('[data-test="hue-sector-solution"]').exists()).toBe(true)
  })

  it('shows the finished picture at once when it is not the one animating', () => {
    // A reload in an already-played round: the card was the reveal on arrival, so there is nothing
    // to play back.
    const w = mountWheel({ animate: false })

    expect(w.get('[data-test="hue-sector"]').classes()).toContain('opacity-100')
    expect(w.findAll<HTMLElement>('[data-test="hue-marker"]')[1]!.classes()).toContain(
      'opacity-100',
    )
  })

  it('starts the others hidden when it does animate', () => {
    const w = mountWheel({ animate: true })

    expect(w.get('[data-test="hue-sector"]').classes()).toContain('opacity-0')
    expect(w.findAll<HTMLElement>('[data-test="hue-marker"]')[1]!.classes()).toContain('opacity-0')
    // Mine never fades: it is the knob, recoloured.
    expect(w.findAll<HTMLElement>('[data-test="hue-marker"]')[0]!.classes()).toContain(
      'opacity-100',
    )
  })

  it('skips straight to the end under reduced motion', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)

    const w = mountWheel({ animate: true })

    expect(w.get('[data-test="hue-sector"]').classes()).toContain('opacity-100')
  })

  it('skips straight to the end in a background tab', () => {
    // A staged reveal driven by requestAnimationFrame has no driver there, and nobody to see it.
    setHidden(true)

    const w = mountWheel({ animate: true })

    expect(w.get('[data-test="hue-sector"]').classes()).toContain('opacity-100')
  })

  it('grows the band inward once the last beat is due', async () => {
    const stacked = [GUESSES[0]!, { userId: 'x', hue: 216, colorHex: '#111111', revealDelayMs: 0 }]
    const w = mountWheel({ animate: true, guesses: stacked })

    expect(w.get('[data-test="hue-ring"]').attributes('style')).toContain('78%')

    vi.advanceTimersByTime(4000)
    await w.vm.$nextTick()

    expect(w.get('[data-test="hue-ring"]').attributes('style')).toContain('68%')
  })

  it('has the band at its final width immediately when it does not animate', () => {
    const stacked = [GUESSES[0]!, { userId: 'x', hue: 216, colorHex: '#111111', revealDelayMs: 0 }]

    const w = mountWheel({ animate: false, guesses: stacked })

    expect(w.get('[data-test="hue-ring"]').attributes('style')).toContain('68%')
  })

  it('keeps the band truthful for a guess that lands after the picture already settled', async () => {
    // The lab reloads a round at the same seed rather than remounting the card, so a guess can
    // still arrive on an already-finished wheel. With no loop ever running (`still`), the ring
    // must pick up the new target directly, with no animation to drive it there.
    const w = mountWheel({ animate: false, guesses: [GUESSES[0]!] })
    expect(w.get('[data-test="hue-ring"]').attributes('style')).toContain('78%')

    const stacked = [GUESSES[0]!, { userId: 'x', hue: 216, colorHex: '#111111', revealDelayMs: 0 }]
    await w.setProps({ guesses: stacked })

    expect(w.get('[data-test="hue-ring"]').attributes('style')).toContain('68%')
  })

  it('keeps the band truthful for a guess that lands once the grow loop has already finished', async () => {
    const stacked = [GUESSES[0]!, { userId: 'x', hue: 216, colorHex: '#111111', revealDelayMs: 0 }]
    const w = mountWheel({ animate: true, guesses: stacked })

    // Past the whole choreography: the loop has already eased the band to its target and set
    // itself back to `frame = 0`.
    vi.advanceTimersByTime(4000)
    await w.vm.$nextTick()
    expect(w.get('[data-test="hue-ring"]').attributes('style')).toContain('68%')

    const deeperStack = [
      ...stacked,
      { userId: 'y', hue: 218, colorHex: '#222222', revealDelayMs: 0 },
    ]
    await w.setProps({ guesses: deeperStack })

    expect(w.get('[data-test="hue-ring"]').attributes('style')).toContain('58%')
  })

  it("takes each marker's moment from the guess, and computes none of its own", () => {
    // The scoreboard owns the timetable now: a marker and its row are the same event, and a
    // second calculation here is exactly how the two would drift apart.
    const w = mountWheel({ animate: true })
    const markers = w.findAll<HTMLElement>('[data-test="hue-marker"]')

    expect(markers[0]!.element.style.transitionDelay).toBe('2000ms')
    expect(markers[1]!.element.style.transitionDelay).toBe('2500ms')
  })

  // Same measurement as the input wheel, by name: the reveal crossfades onto that circle, so any
  // difference in width shows up as a jump the moment the round resolves.
  it('takes its width from the shared wheel measurement', () => {
    const classes = mountWheel().get('[data-test="hue-wheel-reveal"]').classes()

    expect(classes).toContain('hue-wheel')
    expect(classes).not.toContain('max-w-80')
    expect(classes).not.toContain('w-full')
  })
})
