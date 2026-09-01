import { describe, expect, it } from 'vitest'
import type { GameEntry } from '@/games/GameEntry'
import type { VoteView } from '@/api/types'
import { scoreRows, tipTiles } from '../tips'

function entry(over: Partial<GameEntry> & { userId: string }): GameEntry {
  return {
    username: over.userId,
    stage: 0,
    guess: { panoId: 'pano-1', heading: 10, pitch: -5, zoom: 1 },
    outcome: { country: 'DE' },
    points: 1,
    durationMs: null,
    avatar: { bgColorHex: '#7c3aed' },
    votes: [],
    struck: false,
    adminOverride: null,
    ...over,
  }
}

function vote(userId: string, username: string, value: VoteView['value']): VoteView {
  return { userId, username, value }
}

describe('tipTiles', () => {
  it('splits votes into confirmations and flags, keeping the names', () => {
    const tiles = tipTiles({
      entries: [
        entry({
          userId: 'a',
          votes: [vote('b', 'Bianca', 'CONFIRM'), vote('c', 'Caro', 'FLAG')],
        }),
      ],
      mineUserId: null,
    })

    expect(tiles[0]?.confirms).toEqual([vote('b', 'Bianca', 'CONFIRM')])
    expect(tiles[0]?.flags).toEqual([vote('c', 'Caro', 'FLAG')])
  })

  /**
   * `entries` arrives mine-first, so every player used to see the same round in a different
   * arrangement and nobody could point at „the third one“ and be understood. No order is more
   * right than another here — the scoreboard below already ranks — so the only requirement is one
   * order for everybody, and one that does not seat the same person first all run long.
   */
  it('orders the tips by panorama, the same for every viewer', () => {
    const entries = [
      entry({
        userId: 'c',
        username: 'Anna',
        guess: { panoId: 'p-9', heading: 0, pitch: 0, zoom: 1 },
      }),
      entry({
        userId: 'a',
        username: 'Bianca',
        guess: { panoId: 'p-1', heading: 0, pitch: 0, zoom: 1 },
      }),
      entry({
        userId: 'b',
        username: 'Caro',
        guess: { panoId: 'p-5', heading: 0, pitch: 0, zoom: 1 },
      }),
    ]

    const seenByAnna = tipTiles({ entries, mineUserId: 'c' }).map((tile) => tile.name)
    const seenByCaro = tipTiles({ entries, mineUserId: 'b' }).map((tile) => tile.name)

    // Not alphabetical, and not mine-first: the panorama decides.
    expect(seenByAnna).toEqual(['Bianca', 'Caro', 'Anna'])
    expect(seenByCaro).toEqual(seenByAnna)
  })

  /** Nothing to look at, so nothing to look at first. */
  it('sorts a player who gave up behind every tip', () => {
    const tiles = tipTiles({
      entries: [
        entry({ userId: 'a', username: 'Anna', guess: null }),
        entry({
          userId: 'b',
          username: 'Bianca',
          guess: { panoId: 'p-9', heading: 0, pitch: 0, zoom: 1 },
        }),
      ],
      mineUserId: null,
    })

    expect(tiles.map((tile) => tile.name)).toEqual(['Bianca', 'Anna'])
  })

  it('marks the viewer’s own tile', () => {
    const tiles = tipTiles({
      entries: [entry({ userId: 'a' }), entry({ userId: 'b' })],
      mineUserId: 'b',
    })

    expect(tiles.map((tile) => tile.mine)).toEqual([false, true])
  })

  it('carries the struck state the server sent, and never recomputes it', () => {
    const tiles = tipTiles({
      entries: [entry({ userId: 'a', struck: true, votes: [] })],
      mineUserId: null,
    })

    expect(tiles[0]?.struck).toBe(true)
  })

  it('turns the outcome’s country into a flag, and a missing one into nothing', () => {
    const tiles = tipTiles({
      entries: [
        entry({ userId: 'a', outcome: { country: 'FR' } }),
        entry({ userId: 'b', outcome: { country: null } }),
      ],
      mineUserId: null,
    })

    expect(tiles[0]?.flag).toBe('🇫🇷')
    expect(tiles[1]?.flag).toBe('')
  })

  it('answers a null tip for a row that gave up', () => {
    const tiles = tipTiles({
      entries: [entry({ userId: 'a', guess: null })],
      mineUserId: null,
    })

    expect(tiles[0]?.tip).toBeNull()
  })
})

describe('scoreRows', () => {
  it('ranks by points, best first', () => {
    const rows = scoreRows({
      entries: [entry({ userId: 'a', points: 0 }), entry({ userId: 'b', points: 1 })],
      awardRule: 'ALL_QUALIFYING',
      mineUserId: null,
    })

    expect(rows.map((row) => row.userId)).toEqual(['b', 'a'])
  })

  it('formats a timed round’s duration as mm:ss, and leaves an untimed row blank', () => {
    const rows = scoreRows({
      entries: [
        entry({ userId: 'a', durationMs: 65_000 }),
        entry({ userId: 'b', durationMs: null }),
      ],
      awardRule: 'CLOSEST_ONLY',
      mineUserId: null,
    })

    const a = rows.find((row) => row.userId === 'a')
    const b = rows.find((row) => row.userId === 'b')
    expect(a?.durationLabel).toBe('01:05')
    expect(b?.durationLabel).toBeNull()
  })

  it('marks a positive score provisional exactly while the rule is CLOSEST_ONLY', () => {
    const rows = scoreRows({
      entries: [entry({ userId: 'a', points: 1 })],
      awardRule: 'CLOSEST_ONLY',
      mineUserId: null,
    })

    expect(rows[0]?.provisional).toBe(true)
  })
})
