import { describe, expect, it } from 'vitest'
import type { RosterMemberResponse } from '@/api/types'
import { formatWinnerNames, rankOf, winners } from '@/members/winner'

function member(fullName: string, stable: number, live?: number): RosterMemberResponse {
  return {
    userId: fullName,
    shortName: fullName.slice(0, 3).toUpperCase(),
    fullName,
    bgColorHex: '#8e44ad',
    ...(live === undefined
      ? { points: { stable } }
      : { points: { stable, live } }),
  }
}

describe('rankOf', () => {
  it('adds live points to the stable ones', () => {
    expect(rankOf(member('fry', 12, 3))).toBe(15)
  })

  it('counts only the stable points when live ones are withheld', () => {
    expect(rankOf(member('fry', 12))).toBe(12)
  })
})

describe('winners', () => {
  it('picks the single member at the top', () => {
    const list = [member('fry', 12), member('leela', 9), member('bender', 1)]
    expect(winners(list).map((m) => m.fullName)).toEqual(['fry'])
  })

  it('ranks by stable plus live, not by stable alone', () => {
    const list = [member('fry', 12), member('leela', 10, 5)]
    expect(winners(list).map((m) => m.fullName)).toEqual(['leela'])
  })

  it('returns nobody when nobody has scored', () => {
    expect(winners([member('fry', 0), member('leela', 0)])).toEqual([])
  })

  it('returns nobody for an empty roster', () => {
    expect(winners([])).toEqual([])
  })

  it('returns every member tied at the top', () => {
    const list = [member('fry', 12), member('leela', 12), member('bender', 4)]
    expect(winners(list).map((m) => m.fullName)).toEqual(['fry', 'leela'])
  })

  it('keeps the roster order among the tied', () => {
    const list = [member('bender', 7), member('fry', 7), member('leela', 7)]
    expect(winners(list).map((m) => m.fullName)).toEqual(['bender', 'fry', 'leela'])
  })
})

describe('formatWinnerNames', () => {
  it('is empty without a winner', () => {
    expect(formatWinnerNames([])).toBe('')
  })

  it('names one', () => {
    expect(formatWinnerNames(['Fry'])).toBe('Fry')
  })

  it('joins two with und', () => {
    expect(formatWinnerNames(['Fry', 'Leela'])).toBe('Fry und Leela')
  })

  it('joins three with commas and a final und', () => {
    expect(formatWinnerNames(['Fry', 'Leela', 'Bender'])).toBe('Fry, Leela und Bender')
  })
})
