import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import CountdownCard from '@/communities/fallbacks/CountdownCard.vue'
import { BOOT_DARK_MS, BOOT_RESOLVE_AT_MS, DOT_ON } from '@/ui/flipdot/board'
import { bitmap } from '@/ui/flipdot/font'

function mountCard(days: string) {
  return mount(CountdownCard, {
    props: { days, hours: '13', minutes: '42', seconds: '07' },
  })
}

function labelClasses(w: ReturnType<typeof mountCard>): string[][] {
  return w.findAll('[data-test="countdown-label"]').map((l) => l.classes())
}

async function advance(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms)
  await nextTick()
  await nextTick()
}

beforeEach(() => {
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

  it('renders the day count as the hero board', () => {
    const hero = mountCard('58').find('[data-test="countdown-hero"]')
    expect(hero.findAll('circle').length).toBe(11 * 7)
  })

  it('composes the strip as one clock reading', () => {
    const strip = mountCard('58').find('[data-test="countdown-strip"]')
    expect(strip.attributes('aria-label')).toContain('13:42:07')
    expect(strip.findAll('circle').length).toBe(47 * 7)
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

  // Only the hero's event drives the labels; this pins the assumption that the strip is in step.
  it('resolves both boards in the step the labels arrive', async () => {
    const w = mountCard('58')
    const lit = () => w.findAll('circle').filter((c) => c.attributes('fill') === DOT_ON).length

    await advance(BOOT_DARK_MS)
    expect(lit()).toBe(11 * 7 + 47 * 7)

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
})
