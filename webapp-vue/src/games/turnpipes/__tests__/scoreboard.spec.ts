import { describe, expect, it } from 'vitest'
import { gameEntry } from '@/games/__tests__/gameFixtures'
import { hasDurations } from '@/games/durations'
import { scoreRows } from '@/games/turnpipes/scoreboard'

const HIT = { correct: true, wet: [0, 1], leak: null }
const MISS = { correct: false, wet: [0], leak: { at: null, from: 1 } }
const ROTATIONS = Array.from({ length: 36 }, (_, i) => i % 4)

describe('scoreRows', () => {
  it('ranks points, then hits, then the clock, then the id', () => {
    const rows = scoreRows({
      entries: [
        gameEntry({ userId: 'd', outcome: MISS, points: 0, durationMs: 1000 }),
        gameEntry({ userId: 'c', outcome: HIT, points: 0, durationMs: 9000 }),
        gameEntry({ userId: 'b', outcome: HIT, points: 3, durationMs: 5000 }),
        gameEntry({ userId: 'a', outcome: HIT, points: 0, durationMs: 9000 }),
        gameEntry({ userId: 'e', outcome: HIT, points: null, durationMs: 500 }),
      ],
      awardRule: 'CLOSEST_ONLY',
      mineUserId: null,
      size: 6,
    })

    expect(rows.map((row) => row.userId)).toEqual(['b', 'a', 'c', 'd', 'e'])
    expect(rows.map((row) => row.durationLabel)).toEqual([
      '00:05',
      '00:09',
      '00:09',
      '00:01',
      '00:00',
    ])
    expect(rows[0]!.outcome).toEqual(HIT)
  })

  it('has no clock in phase one', () => {
    const rows = scoreRows({
      entries: [gameEntry({ outcome: HIT, points: 1 })],
      awardRule: 'ALL_QUALIFYING',
      mineUserId: null,
      size: 6,
    })

    expect(hasDurations(rows)).toBe(false)
  })

  it('reads the rotations off the guess, and nothing off one of the wrong length', () => {
    const rows = scoreRows({
      entries: [
        gameEntry({ userId: 'ok', outcome: HIT, points: 1, guess: { rotations: ROTATIONS } }),
        gameEntry({ userId: 'short', outcome: HIT, points: 0, guess: { rotations: [0, 1] } }),
        gameEntry({ userId: 'none', outcome: HIT, points: 0, guess: null }),
      ],
      awardRule: null,
      mineUserId: null,
      size: 6,
    })

    expect(Object.fromEntries(rows.map((row) => [row.userId, row.rotations]))).toEqual({
      ok: ROTATIONS,
      short: null,
      none: null,
    })
  })

  it('has no rotations before the scene is here', () => {
    const [row] = scoreRows({
      entries: [gameEntry({ outcome: HIT, points: 1, guess: { rotations: ROTATIONS } })],
      awardRule: null,
      mineUserId: null,
      size: null,
    })

    expect(row!.rotations).toBeNull()
  })

  it('reads a junk outcome as no hit with nothing to show', () => {
    const [row] = scoreRows({
      entries: [gameEntry({ outcome: { correct: 'yes' }, points: 0 })],
      awardRule: null,
      mineUserId: null,
      size: 6,
    })

    expect(row!.correct).toBe(false)
    expect(row!.outcome).toBeNull()
  })
})
