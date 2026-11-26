import { describe, expect, it } from 'vitest'
import { gameEntry } from '@/games/__tests__/gameFixtures'
import { heightLabel, scoreRows } from '@/games/stackfloor/scoreboard'

const outcome = (height: number) => ({ height, marks: [] })

describe('scoreRows', () => {
  it('ranks points, then height, then the id', () => {
    const rows = scoreRows({
      entries: [
        gameEntry({ userId: 'd', outcome: outcome(9), points: null }),
        gameEntry({ userId: 'c', outcome: outcome(3), points: 2 }),
        gameEntry({ userId: 'b', outcome: outcome(7), points: 2 }),
        gameEntry({ userId: 'a', outcome: outcome(7), points: 2 }),
        gameEntry({ userId: 'e', outcome: outcome(1), points: 5 }),
      ],
      mineUserId: null,
    })

    expect(rows.map((row) => row.userId)).toEqual(['e', 'a', 'b', 'c', 'd'])
  })

  it('reads height and marks off the outcome', () => {
    const [row] = scoreRows({
      entries: [gameEntry({ outcome: { height: 4, marks: ['RESTARTED'] } })],
      mineUserId: null,
    })

    expect(row!.height).toBe(4)
    expect(row!.marks).toEqual(['RESTARTED'])
  })

  it('reads the clicks off the guess, and nothing off a bad one', () => {
    const rows = scoreRows({
      entries: [
        gameEntry({ userId: 'ok', guess: { clicks: [5, 6], restarted: false } }),
        gameEntry({ userId: 'bad', guess: { clicks: [-1] } }),
      ],
      mineUserId: null,
    })

    expect(rows.find((row) => row.userId === 'ok')!.clicks).toEqual([5, 6])
    expect(rows.find((row) => row.userId === 'bad')!.clicks).toBeNull()
  })

  it('has no height without a readable outcome', () => {
    const [row] = scoreRows({ entries: [gameEntry()], mineUserId: null })

    expect(row!.height).toBeNull()
    expect(row!.marks).toEqual([])
  })
})

describe('heightLabel', () => {
  it('counts floors', () => {
    expect(heightLabel(1)).toBe('1 Stockwerk')
    expect(heightLabel(0)).toBe('0 Stockwerke')
    expect(heightLabel(5)).toBe('5 Stockwerke')
  })
})
