import { describe, expect, it } from 'vitest'
import { posterName, rampLabel, roundLabel, stakeLine } from '@/ui/ramp/posterText'

describe('posterName', () => {
  it('upper-cases ß to ẞ so CSS does not turn it into SS', () => {
    expect(posterName('Anmaßung')).toBe('Anmaẞung')
  })
})

describe('roundLabel', () => {
  it('writes negative rounds with a true minus sign', () => {
    expect(roundLabel(-98)).toBe('−98')
    expect(roundLabel(0)).toBe('0')
    expect(roundLabel(3)).toBe('3')
  })
})

describe('stakeLine', () => {
  it('pluralises the points', () => {
    expect(stakeLine(12)).toBe('12 Punkte zum Abstauben')
    expect(stakeLine(1)).toBe('1 Punkt zum Abstauben')
  })

  it('is absent without a positive stake', () => {
    expect(stakeLine(null)).toBeNull()
    expect(stakeLine(0)).toBeNull()
  })
})

describe('rampLabel', () => {
  it('names the round and game, without the stake in phase one', () => {
    expect(rampLabel({ game: 'Verrohrung', roundNumber: -98, phaseTwo: false, points: null })).toBe(
      'Aktuelle Runde −98: Verrohrung. Öffnen.',
    )
  })

  it('adds the stake in phase two', () => {
    expect(rampLabel({ game: 'Peilung', roundNumber: -98, phaseTwo: true, points: 12 })).toBe(
      'Aktuelle Runde −98: Peilung. 12 Punkte zum Abstauben. Öffnen.',
    )
  })
})
