import { describe, expect, it } from 'vitest'
import type { GameEntry } from '@/games/GameEntry'
import { hasDurations } from '@/games/durations'
import { scoreRows } from '@/games/placepatch/scoreboard'
import { gameEntry } from '@/games/__tests__/gameFixtures'

const LAYOUT = { cols: 40, rows: 30, size: 10 }
const SOLUTION = { x: 7, y: 4 }

function rows(entries: GameEntry[], mineUserId: string | null = null) {
  return scoreRows({
    entries,
    solution: SOLUTION,
    layout: LAYOUT,
    awardRule: 'CLOSEST_ONLY',
    mineUserId,
  })
}

describe('placepatch scoreRows', () => {
  it('reads a hit off the cell, not off the outcome', () => {
    const [hit, miss] = rows([
      gameEntry({ userId: 'a', guess: { x: 7, y: 4 }, points: 3 }),
      gameEntry({ userId: 'b', guess: { x: 8, y: 4 }, points: 0 }),
    ])

    expect(hit).toMatchObject({ userId: 'a', correct: true, cell: { x: 7, y: 4 } })
    expect(miss).toMatchObject({ userId: 'b', correct: false })
  })

  it('treats a give-up and a guess off the board alike: no tip', () => {
    const result = rows([
      gameEntry({ userId: 'gave-up', guess: null }),
      gameEntry({ userId: 'junk', guess: { x: 99, y: 3 } }),
    ])

    expect(result.every((row) => row.cell === null && !row.correct)).toBe(true)
  })

  it('ranks by points, then hits, then the faster clock, then the user id', () => {
    const result = rows([
      gameEntry({ userId: 'slow-hit', guess: { x: 7, y: 4 }, points: 0, durationMs: 50_000 }),
      gameEntry({ userId: 'miss', guess: { x: 1, y: 1 }, points: 0, durationMs: 10_000 }),
      gameEntry({ userId: 'winner', guess: { x: 7, y: 4 }, points: 3, durationMs: 20_000 }),
      gameEntry({ userId: 'fast-hit', guess: { x: 7, y: 4 }, points: 0, durationMs: 30_000 }),
    ])

    expect(result.map((row) => row.userId)).toEqual(['winner', 'fast-hit', 'slow-hit', 'miss'])
    expect(result[0]?.durationLabel).toBe('00:20')
  })

  it('knows whether the round was timed', () => {
    expect(hasDurations(rows([gameEntry({ userId: 'a', durationMs: 1_000 })]))).toBe(true)
    expect(hasDurations(rows([gameEntry({ userId: 'a' })]))).toBe(false)
  })
})
