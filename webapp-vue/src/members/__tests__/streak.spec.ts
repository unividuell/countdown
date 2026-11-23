import { describe, expect, it } from 'vitest'
import { bandLabel, bandOf, markBox, markSize } from '@/members/streak'

describe('streak', () => {
  it.each([
    [2, null],
    [3, 'flame-orange'],
    [9, 'flame-orange'],
    [10, 'flame-blue'],
    [19, 'flame-blue'],
    [20, 'diamond-ice'],
    [32, 'diamond-ice'],
    [33, 'diamond-ruby'],
    [49, 'diamond-ruby'],
    [50, 'diamond-ruby-glint'],
    [120, 'diamond-ruby-glint'],
  ])('band of %i is %s', (n, band) => expect(bandOf(n)).toBe(band))

  it('grows on a log curve from 14 to 26 px and stops at 50', () => {
    expect(markSize(3)).toBeCloseTo(14, 5)
    expect(markSize(10)).toBeCloseTo(20.45, 2)
    expect(markSize(50)).toBeCloseTo(26, 5)
    expect(markSize(120)).toBeCloseTo(26, 5)
  })

  it('puts the foot 3px inside the circle at 45°', () =>
    expect(markBox(26)).toEqual({ left: expect.closeTo(25.8, 5), top: expect.closeTo(-14.2, 5) }))

  it('labels every band in German', () => {
    expect(bandLabel('flame-orange')).toBe('Flamme')
    expect(bandLabel('flame-blue')).toBe('blaue Flamme')
    expect(bandLabel('diamond-ice')).toBe('Eis-Diamant')
    expect(bandLabel('diamond-ruby')).toBe('Rubin')
    expect(bandLabel('diamond-ruby-glint')).toBe('funkelnder Rubin')
  })
})
