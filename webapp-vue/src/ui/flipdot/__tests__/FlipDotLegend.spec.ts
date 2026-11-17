import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FlipDotLegend from '@/ui/flipdot/FlipDotLegend.vue'
import { groupCentres } from '@/ui/flipdot/board'

function mountLegend(text: string, labels: string[], visible = true) {
  return mount(FlipDotLegend, { props: { text, labels, visible } })
}

const lefts = (w: ReturnType<typeof mountLegend>) =>
  w
    .findAll('[data-test="legend-label"]')
    .map((s) => Number.parseFloat((s.element as HTMLElement).style.left))

describe('FlipDotLegend', () => {
  it('places one label per digit group, on its computed centre', () => {
    const w = mountLegend('13:42:07', ['STD', 'MIN', 'SEK'])
    expect(w.findAll('[data-test="legend-label"]').map((s) => s.text())).toEqual([
      'STD',
      'MIN',
      'SEK',
    ])
    const expected = groupCentres('13:42:07')
    lefts(w).forEach((left, i) => expect(left).toBeCloseTo(expected[i]!, 3))
  })

  // The position is a computed percentage, so it has to be an inline style: Tailwind scans the
  // source and would never generate an interpolated left-[..%].
  it('positions with an inline style, not a utility class', () => {
    const first = mountLegend('13:42:07', ['STD', 'MIN', 'SEK']).findAll(
      '[data-test="legend-label"]',
    )[0]!
    expect((first.element as HTMLElement).style.left).not.toBe('')
    expect(first.classes()).toContain('-translate-x-1/2')
  })

  it('is hidden from assistive tech, because the board already reads the value', () => {
    expect(mountLegend('13:42:07', ['STD', 'MIN', 'SEK']).attributes('aria-hidden')).toBe('true')
  })

  it('follows the visible flag with a transition, not by unmounting', () => {
    const hidden = mountLegend('13:42:07', ['STD', 'MIN', 'SEK'], false)
    expect(hidden.classes()).toContain('opacity-0')
    expect(hidden.classes()).toContain('transition-opacity')
    expect(hidden.findAll('[data-test="legend-label"]')).toHaveLength(3)
    expect(mountLegend('13:42:07', ['STD', 'MIN', 'SEK'], true).classes()).toContain('opacity-100')
  })

  it('grows and shrinks with the readout', () => {
    expect(
      mountLegend('1:3:04:33:12', ['WO', 'TAGE', 'STD', 'MIN', 'SEK']).findAll(
        '[data-test="legend-label"]',
      ),
    ).toHaveLength(5)
    expect(
      mountLegend('12:04:33:12', ['TAGE', 'STD', 'MIN', 'SEK']).findAll(
        '[data-test="legend-label"]',
      ),
    ).toHaveLength(4)
  })

  it('renders an empty cell rather than undefined when a label is missing', () => {
    const w = mountLegend('13:42:07', ['STD'])
    expect(w.findAll('[data-test="legend-label"]')).toHaveLength(3)
    expect(w.text()).toBe('STD')
  })

  // This is a contrast floor, not a styling preference: 11px text needs 4.5:1 (WCAG AA).
  // on-board at 70% measures 6.0:1 on the game band (#3d3d3d) and 9.3:1 on the countdown
  // card's solid board. Do not dim this without checking both backgrounds.
  it('meets the contrast floor against a dark background', () => {
    expect(mountLegend('13:42:07', ['STD', 'MIN', 'SEK']).classes()).toContain('text-on-board/70')
  })

  // On the page (the header countdown) the labels take the page's secondary text, which follows
  // the colour scheme; on-board's near-white would vanish on the light page.
  it('takes the page text colour on the page surface', () => {
    const w = mount(FlipDotLegend, {
      props: { text: '13:42:07', labels: ['STD', 'MIN', 'SEK'], visible: true, ground: 'surface' },
    })
    expect(w.classes()).toContain('text-on-surface-variant')
    expect(w.classes()).not.toContain('text-on-board/70')
  })

  // Under a padded board the labels must be measured over the same padded field.
  it('places the labels over a padded field', () => {
    const pad = { top: 1, right: 1, bottom: 1, left: 1 }
    const w = mount(FlipDotLegend, {
      props: { text: '13:42:07', labels: ['STD', 'MIN', 'SEK'], visible: true, pad },
    })
    const expected = groupCentres('13:42:07', pad)
    lefts(w).forEach((left, i) => expect(left).toBeCloseTo(expected[i]!, 3))
  })
})
