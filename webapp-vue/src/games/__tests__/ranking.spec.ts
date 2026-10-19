import { describe, expect, it } from 'vitest'
import type { GameEntry } from '@/games/GameEntry'
import { rankByClock, withTicks } from '@/games/ranking'
import { gameEntry } from '@/games/__tests__/gameFixtures'

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
        gameEntry({ userId: 'a', points: null }),
        gameEntry({ userId: 'b', points: 0 }),
        gameEntry({ userId: 'c', points: 3 }),
      ],
      () => false,
    )

    expect(order).toEqual(['c', 'b', 'a'])
  })

  it('puts a hit before a miss on equal points', () => {
    const order = rank(
      [
        gameEntry({ userId: 'a', durationMs: 1_000 }),
        gameEntry({ userId: 'b', durationMs: 9_000 }),
      ],
      (entry) => entry.userId === 'b',
    )

    expect(order).toEqual(['b', 'a'])
  })

  it('ranks a game without hits by the clock, a missing one last, then by user id', () => {
    const order = rankByClock(
      [
        gameEntry({ userId: 'd' }),
        gameEntry({ userId: 'c', durationMs: 2_000 }),
        gameEntry({ userId: 'b', durationMs: 1_000 }),
        gameEntry({ userId: 'a' }),
      ],
      null,
      (entry) => ({ userId: entry.userId, points: entry.points }),
    ).map((row) => row.userId)

    expect(order).toEqual(['b', 'c', 'a', 'd'])
  })

  it('stamps the ticks after ranking', () => {
    const rows = rankByClock(
      [gameEntry({ userId: 'a', points: 0 }), gameEntry({ userId: 'b', points: 3 })],
      'b',
      (entry) => ({ userId: entry.userId, points: entry.points }),
    )

    expect(rows).toEqual([
      { userId: 'b', points: 3, tick: 1 },
      { userId: 'a', points: 0, tick: 1 },
    ])
  })
})
