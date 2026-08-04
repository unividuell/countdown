import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CountdownCard from '@/communities/fallbacks/CountdownCard.vue'

function mountCard(days: string) {
  return mount(CountdownCard, {
    props: { days, hours: '13', minutes: '42', seconds: '07' },
  })
}

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

  it('widens the hero for a three-digit day count instead of overflowing', () => {
    expect(mountCard('58').find('[data-test="countdown-hero"]').classes()).toContain('w-[72%]')
    expect(mountCard('128').find('[data-test="countdown-hero"]').classes()).toContain('w-[92%]')
    expect(mountCard('1000').find('[data-test="countdown-hero"]').classes()).toContain('w-full')
  })

  it('does not let a fallthrough w-full outrank the digit-count width', () => {
    expect(mountCard('58').find('[data-test="countdown-hero"]').classes()).not.toContain('w-full')
    expect(mountCard('128').find('[data-test="countdown-hero"]').classes()).not.toContain('w-full')
  })

  it('labels the three time groups', () => {
    const text = mountCard('58').text()
    expect(text).toContain('TAGE')
    expect(text).toContain('STD')
    expect(text).toContain('MIN')
    expect(text).toContain('SEK')
  })
})
