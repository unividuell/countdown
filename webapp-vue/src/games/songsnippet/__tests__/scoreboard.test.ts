import { describe, expect, it } from 'vitest'
import type { GameEntry } from '@/games/GameEntry'
import { scoreRows } from '../scoreboard'

const DURATIONS = [0.1, 0.5, 2, 8, 15]

function entry(overrides: Partial<GameEntry> & { userId: string }): GameEntry {
  return {
    username: overrides.userId,
    stage: 0,
    guess: null,
    outcome: null,
    points: 0,
    avatar: { bgColorHex: '#406abf' },
    ...overrides,
  }
}

function rowsOf(entries: GameEntry[], awardRule: 'ALL_QUALIFYING' | 'CLOSEST_ONLY' | null = null) {
  return scoreRows({ entries, durations: DURATIONS, awardRule })
}

describe('scoreRows', () => {
  it('ranks by points first, then by the least audio, then stably by user id', () => {
    const rows = rowsOf([
      entry({ userId: 'slow-winner', points: 5, stage: 3 }),
      entry({ userId: 'empty-b', points: 0, stage: 1 }),
      entry({ userId: 'fast-winner', points: 5, stage: 1 }),
      entry({ userId: 'empty-a', points: 0, stage: 1 }),
    ])

    expect(rows.map((r) => r.userId)).toEqual(['fast-winner', 'slow-winner', 'empty-a', 'empty-b'])
  })

  it('writes the guess as „Titel · Artist“ and keeps the track id for playback', () => {
    const rows = rowsOf([
      entry({ userId: 'a', guess: { trackId: 42, artist: 'Eagles', title: 'Hotel California' } }),
    ])

    expect(rows[0]!.guessLabel).toBe('Hotel California · Eagles')
    expect(rows[0]!.trackId).toBe(42)
  })

  it('marks a guess-less entry as a give-up, with nothing to play', () => {
    const rows = rowsOf([entry({ userId: 'quitter', guess: null })])

    expect(rows[0]!.guessLabel).toBe('— aufgegeben —')
    expect(rows[0]!.trackId).toBeNull()
  })

  it('survives a junk guess rather than printing undefined', () => {
    const rows = rowsOf([entry({ userId: 'junk', guess: 'not an object' })])

    expect(rows[0]!.guessLabel).toBe('— aufgegeben —')
    expect(rows[0]!.trackId).toBeNull()
  })

  it('reads correctness from the outcome, for playability only', () => {
    const rows = rowsOf([
      entry({ userId: 'right', guess: { trackId: 1 }, outcome: { correct: true } }),
      entry({ userId: 'wrong', guess: { trackId: 2 }, outcome: { correct: false } }),
    ])

    expect(rows.find((r) => r.userId === 'right')!.correct).toBe(true)
    expect(rows.find((r) => r.userId === 'wrong')!.correct).toBe(false)
  })

  it('labels the reached stage in seconds', () => {
    const rows = rowsOf([entry({ userId: 'a', stage: 0 }), entry({ userId: 'b', stage: 3 })])

    expect(rows.find((r) => r.userId === 'a')!.timeLabel).toBe('0,1s')
    expect(rows.find((r) => r.userId === 'b')!.timeLabel).toBe('8s')
  })

  it('paints the row in the player colour, with ink that reads against it', () => {
    const rows = rowsOf([
      entry({ userId: 'dark', avatar: { bgColorHex: '#101010' } }),
      entry({ userId: 'light', avatar: { bgColorHex: '#fefefe' } }),
    ])

    expect(rows.find((r) => r.userId === 'dark')!.ink).toBe('#ffffff')
    expect(rows.find((r) => r.userId === 'light')!.ink).toBe('#111111')
  })

  it('calls a positive score provisional only while the round pays the closest alone', () => {
    const scored = [entry({ userId: 'a', points: 5 })]
    const zero = [entry({ userId: 'b', points: 0 })]
    const unscored = [entry({ userId: 'c', points: null })]

    expect(rowsOf(scored, 'CLOSEST_ONLY')[0]!.provisional).toBe(true)
    expect(rowsOf(scored, 'ALL_QUALIFYING')[0]!.provisional).toBe(false)
    expect(rowsOf(zero, 'CLOSEST_ONLY')[0]!.provisional).toBe(false)
    expect(rowsOf(unscored, 'CLOSEST_ONLY')[0]!.provisional).toBe(false)
  })
})
