import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import CountdownCard from '@/communities/fallbacks/CountdownCard.vue'
import {
  BOOT_DARK_MS,
  BOOT_HOLD_MS,
  BOOT_RESOLVE_AT_MS,
  DOT_ON,
  groupCentres,
} from '@/ui/flipdot/board'
import { bitmap } from '@/ui/flipdot/font'

function mountCard(days: string) {
  return mount(CountdownCard, {
    props: { days, hours: '13', minutes: '42', seconds: '07' },
  })
}

// Both label groups, so a single assertion can cover the case where they ought to agree — boot,
// when both boards switch on together. The relight case below is precisely where they are allowed
// to diverge, so it reads each group individually instead of through this helper.
function labelClasses(w: ReturnType<typeof mountCard>): string[][] {
  return [
    w.get('[data-test="countdown-label-days"]').classes(),
    w.get('[data-test="countdown-label-time"]').classes(),
  ]
}

async function advance(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms)
  await nextTick()
  await nextTick()
}

beforeEach(() => {
  // The dot counts below read the boards at rest. happy-dom has shipped the Web Animations API
  // since 20.12, so the flip now runs here and holds every dot it has not reached at its pre-flip
  // colour — a board mid-reveal, not the readout. Taking `animate` away puts the boards back on
  // the path the component keeps for a browser without it: resolve straight to the resting colour.
  Reflect.deleteProperty(Element.prototype, 'animate')
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('CountdownCard', () => {
  it('is square', () => {
    expect(mountCard('58').find('[data-test="countdown-card"]').classes()).toContain(
      'aspect-square',
    )
  })

  // Same slot as the round and the message fallback, so the same edge length — but taking the
  // measurement rather than `RoundSurface`, because its two flip-dot boards are percentages of the
  // whole surface and a padded interior cannot express 94% of the band.
  it('spans the display on a phone by the shared bleed', () => {
    const classes = mountCard('42').classes()

    expect(classes).toContain('round-bleed')
    expect(classes).toContain('aspect-square')
  })

  // See MessageCard for the measurement: `width: 100%` plus a negative inline margin is
  // over-constrained, so the box would shift instead of widen.
  it('leaves its width to the bleed', () => {
    expect(mountCard('42').classes()).not.toContain('w-full')
  })

  it('keeps its corners only from sm, where it is a card again', () => {
    const classes = mountCard('42').classes()

    expect(classes).toContain('sm:rounded-xl')
    expect(classes).not.toContain('rounded-xl')
  })

  it('keeps the vertical padding its boards are placed by, and no horizontal padding', () => {
    const classes = mountCard('42').classes()

    expect(classes).toContain('py-4')
    expect(classes.join(' ')).not.toMatch(/(^|\s)(p|px)-\d/)
  })

  it('renders the day count as the hero board', () => {
    const hero = mountCard('58').find('[data-test="countdown-hero"]')
    expect(hero.findAll('circle').length).toBe(11 * 7)
  })

  it('composes the strip as one clock reading', () => {
    const strip = mountCard('58').find('[data-test="countdown-strip"]')
    expect(strip.attributes('aria-label')).toContain('13:42:07')
    expect(strip.findAll('circle').length).toBe(43 * 7)
  })

  it('names the day count without its padding for assistive tech', () => {
    expect(mountCard('07').find('[data-test="countdown-hero"]').attributes('aria-label')).toBe(
      '7 Tage bis zum Start',
    )
  })

  it('uses the German singular on the last full day', () => {
    expect(mountCard('01').find('[data-test="countdown-hero"]').attributes('aria-label')).toBe(
      '1 Tag bis zum Start',
    )
    expect(mountCard('00').find('[data-test="countdown-hero"]').attributes('aria-label')).toBe(
      '0 Tage bis zum Start',
    )
  })

  it('widens the hero for a three-digit day count instead of overflowing', () => {
    expect(mountCard('58').find('[data-test="countdown-hero"]').classes()).toContain('w-[72%]')
    expect(mountCard('128').find('[data-test="countdown-hero"]').classes()).toContain('w-[92%]')
    expect(mountCard('1000').find('[data-test="countdown-hero"]').classes()).toContain('w-full')
  })

  it('does not let a fallthrough w-full outrank the digit-count width', () => {
    expect(mountCard('58').find('[data-test="countdown-hero"]').classes()).not.toContain('w-full')
    expect(mountCard('128').find('[data-test="countdown-hero"]').classes()).not.toContain('w-full')
  })

  // Structural proxies only: happy-dom computes no CSS, so neither the shrink-to-fit box nor the
  // resulting pixel widths are observable here. Both classes are what makes the hero's percentage
  // resolve against the card's outer width in a real browser.
  it('stretches the hero block instead of letting it shrink-wrap the svg', () => {
    const wrapper = mountCard('58').find('[data-test="countdown-hero"]').element.parentElement
    expect(wrapper?.className).toContain('w-full')
  })

  it('keeps the card free of horizontal padding, so the percentages match the outer width', () => {
    const card = mountCard('58').find('[data-test="countdown-card"]').classes()
    expect(card.filter((c) => /^(px|pl|pr|p)-/.test(c))).toEqual([])
    expect(card).toContain('py-4')
  })

  it('labels the three time groups', () => {
    const text = mountCard('58').text()
    expect(text).toContain('TAGE')
    expect(text).toContain('STD')
    expect(text).toContain('MIN')
    expect(text).toContain('SEK')
  })

  // happy-dom computes no CSS, so the opacity classes are the observable proxy for the fade.
  it('holds the labels back until the boards start resolving', async () => {
    const w = mountCard('58')
    expect(labelClasses(w).length).toBe(2)
    expect(labelClasses(w).every((c) => c.includes('opacity-0'))).toBe(true)

    await advance(BOOT_DARK_MS)
    expect(labelClasses(w).every((c) => c.includes('opacity-0'))).toBe(true)

    await advance(BOOT_RESOLVE_AT_MS - BOOT_DARK_MS)
    expect(labelClasses(w).every((c) => c.includes('opacity-100'))).toBe(true)
    expect(labelClasses(w).every((c) => c.includes('transition-opacity'))).toBe(true)
  })

  // Each board drives its own label from its own event, but at boot both still resolve on the same
  // tick; this pins that assumption rather than any dependency between the two boards.
  it('resolves both boards in the step the labels arrive', async () => {
    const w = mountCard('58')
    const lit = () => w.findAll('circle').filter((c) => c.attributes('fill') === DOT_ON).length

    await advance(BOOT_DARK_MS)
    expect(lit()).toBe(11 * 7 + 43 * 7)

    await advance(BOOT_RESOLVE_AT_MS - BOOT_DARK_MS)
    expect(lit()).toBe(
      bitmap('58').on.filter(Boolean).length + bitmap('13:42:07').on.filter(Boolean).length,
    )
    expect(labelClasses(w).every((c) => c.includes('opacity-100'))).toBe(true)
  })

  it('shows the labels straight away under prefers-reduced-motion', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    const w = mountCard('58')
    await nextTick()
    expect(labelClasses(w).every((c) => c.includes('opacity-100'))).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('positions the strip labels on the computed group centres', () => {
    const spans = mountCard('58').get('[data-test="countdown-label-time"]').findAll('span')
    const expected = groupCentres('13:42:07')
    expect(spans).toHaveLength(3)
    spans.forEach((span, i) => {
      expect(Number.parseFloat((span.element as HTMLElement).style.left)).toBeCloseTo(
        expected[i]!,
        3,
      )
    })
  })

  // The hero relights when the day count loses a digit, and only the hero. Driving both label
  // groups from one flag would blink STD/MIN/SEK out for 300ms while their strip stayed perfectly
  // legible.
  it('fades only the labels of the board that is relighting', async () => {
    const w = mountCard('100')
    await advance(BOOT_RESOLVE_AT_MS)
    expect(labelClasses(w).every((c) => c.includes('opacity-100'))).toBe(true)

    await w.setProps({ days: '99' })
    await nextTick()
    expect(w.get('[data-test="countdown-label-days"]').classes()).toContain('opacity-0')
    expect(w.get('[data-test="countdown-label-time"]').classes()).toContain('opacity-100')

    await advance(BOOT_HOLD_MS)
    expect(labelClasses(w).every((c) => c.includes('opacity-100'))).toBe(true)
  })
})
