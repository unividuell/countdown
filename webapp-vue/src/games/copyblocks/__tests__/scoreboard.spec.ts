import { describe, expect, it } from 'vitest'
import type { GameEntry } from '@/games/GameEntry'
import { hasDurations, scoreRows } from '@/games/copyblocks/scoreboard'

function entry(over: Partial<GameEntry>): GameEntry {
  return {
    userId: 'u',
    username: 'U',
    stage: 0,
    guess: null,
    outcome: null,
    points: null,
    durationMs: null,
    avatar: { bgColorHex: '#336699' },
    votes: [],
    struck: false,
    adminOverride: null,
    ...over,
  }
}

const HIT = {
  correct: true,
  fit: { turns: 0, dx: 0, dy: 0, dz: 0 },
  missing: [],
  extra: [],
  wrongType: [],
}
const MISS = { ...HIT, correct: false, missing: [{ x: 0, y: 0, z: 0, type: 'DIRT' }] }

describe('scoreRows', () => {
  it('ranks points, then hits, then the clock, then the id', () => {
    const rows = scoreRows({
      entries: [
        entry({ userId: 'd', outcome: MISS, points: 0, durationMs: 1000 }),
        entry({ userId: 'c', outcome: HIT, points: 0, durationMs: 9000 }),
        entry({ userId: 'b', outcome: HIT, points: 3, durationMs: 5000 }),
        entry({ userId: 'a', outcome: HIT, points: 0, durationMs: 9000 }),
        entry({ userId: 'e', outcome: HIT, points: null, durationMs: 500 }),
      ],
      awardRule: 'CLOSEST_ONLY',
      mineUserId: null,
      templateSize: 5,
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
      entries: [entry({ outcome: HIT, points: 1 })],
      awardRule: 'ALL_QUALIFYING',
      mineUserId: null,
      templateSize: 5,
    })

    expect(hasDurations(rows)).toBe(false)
  })

  it('counts what a tip got right against everything marked on it', () => {
    const block = { x: 0, y: 0, z: 0, type: 'DIRT' }
    const mixed = {
      ...HIT,
      correct: false,
      missing: [block, block],
      extra: [block],
      wrongType: [block],
    }
    const rows = scoreRows({
      entries: [
        entry({ userId: 'hit', outcome: HIT, points: 1 }),
        entry({ userId: 'mixed', outcome: mixed, points: 0 }),
        entry({ userId: 'junk', outcome: { correct: 'yes' }, points: 0 }),
      ],
      awardRule: 'ALL_QUALIFYING',
      mineUserId: null,
      templateSize: 10,
    })

    expect(Object.fromEntries(rows.map((row) => [row.userId, row.kdLabel]))).toEqual({
      hit: '10/0',
      mixed: '7/4',
      junk: null,
    })
  })

  it('has no K/D without the template', () => {
    const [row] = scoreRows({
      entries: [entry({ outcome: HIT, points: 1 })],
      awardRule: null,
      mineUserId: null,
      templateSize: null,
    })

    expect(row!.kdLabel).toBeNull()
  })

  it('reads a junk outcome as no hit with nothing to show', () => {
    const [row] = scoreRows({
      entries: [entry({ outcome: { correct: 'yes' }, points: 0 })],
      awardRule: null,
      mineUserId: null,
      templateSize: 5,
    })

    expect(row!.correct).toBe(false)
    expect(row!.outcome).toBeNull()
  })
})
