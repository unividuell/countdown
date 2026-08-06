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

  it('falls back to light text when the colour cannot be parsed', () => {
    expect(readableTextColor('rebeccapurple')).toBe(LIGHT)
    expect(readableTextColor('')).toBe(LIGHT)
  })
})
