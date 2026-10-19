import { describe, expect, it } from 'vitest'
import type { GameEntry } from '@/games/GameEntry'
import { rankByClock, withTicks } from '@/games/ranking'

function entry(over: Partial<GameEntry> & { userId: string }): GameEntry {
  return {
    username: over.userId,
    stage: 0,
    guess: null,
    outcome: null,
    points: 0,
    durationMs: null,
    avatar: { bgColorHex: '#7c3aed' },
    votes: [],
    struck: false,
    adminOverride: null,
    ...over,
  }
}

describe('withTicks', () => {
  it('lets every row ride its rank, except mine', () => {
    const rows = withTicks([{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }], 'a')

    expect(rows.map((row) => row.tick)).toEqual([1, 1, 2])
  })

  it('is the plain rank without a row of mine', () => {
    const rows = withTicks([{ userId: 'a' }, { userId: 'b' }], null)

    expect(rows.map((row) => row.tick)).toEqual([0, 1])
  })
})

describe('rankByClock', () => {
  const rank = (entries: GameEntry[], hit: (entry: GameEntry) => boolean) =>
    rankByClock(entries, null, (entry) => ({
      userId: entry.userId,
      points: entry.points,
      correct: hit(entry),
    })).map((row) => row.userId)

  it('orders by points, a missing score last', () => {
    const order = rank(
      [
        entry({ userId: 'a', points: null }),
        entry({ userId: 'b', points: 0 }),
        entry({ userId: 'c', points: 3 }),
      ],
      () => false,
    )

    expect(order).toEqual(['c', 'b', 'a'])
  })

  it('puts a hit before a miss on equal points', () => {
    const order = rank(
      [entry({ userId: 'a', durationMs: 1_000 }), entry({ userId: 'b', durationMs: 9_000 })],
      (entry) => entry.userId === 'b',
    )

    expect(order).toEqual(['b', 'a'])
  })

  it('ranks a game without hits by the clock, a missing one last, then by user id', () => {
    const order = rankByClock(
      [
        entry({ userId: 'd' }),
        entry({ userId: 'c', durationMs: 2_000 }),
        entry({ userId: 'b', durationMs: 1_000 }),
        entry({ userId: 'a' }),
      ],
      null,
      (entry) => ({ userId: entry.userId, points: entry.points }),
    ).map((row) => row.userId)

    expect(order).toEqual(['b', 'c', 'a', 'd'])
  })

  it('stamps the ticks after ranking', () => {
    const rows = rankByClock(
      [entry({ userId: 'a', points: 0 }), entry({ userId: 'b', points: 3 })],
      'b',
      (entry) => ({ userId: entry.userId, points: entry.points }),
    )

    expect(rows).toEqual([
      { userId: 'b', points: 3, tick: 1 },
      { userId: 'a', points: 0, tick: 1 },
    ])
  })
})
