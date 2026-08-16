import { describe, expect, it } from 'vitest'
import { readableTextColor } from '../readableTextColor'

const DARK = '#111111'
const LIGHT = '#ffffff'

describe('readableTextColor', () => {
  it('picks the extremes correctly', () => {
    expect(readableTextColor('#000000')).toBe(LIGHT)
    expect(readableTextColor('#ffffff')).toBe(DARK)
  })

  // The expectations are the hand-picked foregrounds of the spike palette: agreeing with all
  // six means the formula reproduces a judgement a human made.
  it.each([
    ['#8e44ad', LIGHT], // purple
    ['#6b8e3a', DARK], //  olive
    ['#1a3fb8', LIGHT], // blue
    ['#f2cf46', DARK], //  yellow
    ['#5fc493', DARK], //  green
    ['#5b95c4', DARK], //  steel blue
  ])('matches the spike palette for %s', (bg, expected) => {
    expect(readableTextColor(bg)).toBe(expected)
  })

  it('accepts the three-digit form', () => {
    expect(readableTextColor('#fff')).toBe(DARK)
    expect(readableTextColor('#000')).toBe(LIGHT)
  })

  // A seeded player colour measured in a real browser pass: relative luminance 0.17998, which sits
  // just above the old (wrong) 0.179 threshold but below the true equal-contrast crossover
  // (≈0.191631, since DARK is #111111, not pure black). The old code picked DARK here at a 4.14:1
  // contrast ratio, below WCAG AA's 4.5:1 for normal text, where LIGHT gives 4.57:1.
  it('picks light ink for a colour just below the true crossover', () => {
    expect(readableTextColor('#bf40b3')).toBe(LIGHT)
  })

  // Same hue family, nudged just past the crossover (luminance ≈0.192286) to confirm the switch
  // still flips to dark ink on the correct side once past it.
  it('picks dark ink for a colour just above the true crossover', () => {
    expect(readableTextColor('#bf4ab3')).toBe(DARK)
  })

  it('falls back to light text when the colour cannot be parsed', () => {
    expect(readableTextColor('rebeccapurple')).toBe(LIGHT)
    expect(readableTextColor('')).toBe(LIGHT)
  })
})
