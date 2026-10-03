import { describe, expect, it } from 'vitest'
import type { GameEntry } from '@/games/GameEntry'
import { scoreRows } from '../scoreboard'

function entry(userId: string, guess: unknown, outcome: unknown, points: number | null): GameEntry {
  return {
    userId,
    username: userId,
    stage: 0,
    guess,
    outcome,
    points,
    durationMs: null,
    avatar: { bgColorHex: '#2563eb' },
    votes: [],
    struck: false,
    adminOverride: null,
  }
}

function played(
  userId: string,
  reactions: number[],
  endedBy: string,
  points: number,
  extra: Record<string, unknown> = {},
) {
  const average =
    reactions.length === 0 ? null : reactions.reduce((a, b) => a + b, 0) / reactions.length
  return entry(
    userId,
    { reactionsMs: reactions, endedBy, wrongTileIndex: null, restarted: false },
    {
      tilesCleared: reactions.length,
      endedBy,
      wrongTileIndex: null,
      averageReactionMs: average,
      implausible: [],
      restarted: false,
      ...extra,
    },
    points,
  )
}

describe('deduster scoreRows', () => {
  it('sorts by points, then how far, then the faster average', () => {
    const rows = scoreRows({
      entries: [
        played('slow', [500, 500, 500, 500], 'COMPLETE', 1),
        played('early', [200], 'TOO_LATE', 0),
        played('fast', [300, 300, 300, 300], 'COMPLETE', 1),
        played('further', [250, 250], 'WRONG_TILE', 0),
      ],
      tiles: 4,
      awardRule: 'ALL_QUALIFYING',
      mineUserId: null,
    })

    expect(rows.map((r) => r.userId)).toEqual(['fast', 'slow', 'further', 'early'])
  })

  it('reads the original’s columns', () => {
    const [row] = scoreRows({
      entries: [played('a', [300, 401], 'WRONG_TILE', 0)],
      tiles: 4,
      awardRule: null,
      mineUserId: null,
    })

    expect(row!.averageLabel).toBe('351')
    expect(row!.levelLabel).toBe('50')
    expect(row!.out).toBe('verklickt')
  })

  it('says „—“ for a run without a single hit, and names every way out', () => {
    const rows = scoreRows({
      entries: [played('none', [], 'TOO_LATE', 0), played('all', [300, 300], 'COMPLETE', 1)],
      tiles: 2,
      awardRule: null,
      mineUserId: null,
    })
    const byId = Object.fromEntries(rows.map((r) => [r.userId, r]))

    expect(byId.none!.averageLabel).toBe('—')
    expect(byId.none!.out).toBe('zu spät')
    expect(byId.all!.out).toBe('mit Applaus')
  })

  it('carries the marks the server set', () => {
    const [row] = scoreRows({
      entries: [
        played('m', [100], 'TOO_LATE', 0, {
          implausible: ['SUBMITTED_BEFORE_RUN_END'],
          restarted: true,
        }),
      ],
      tiles: 4,
      awardRule: null,
      mineUserId: null,
    })

    expect(row!.implausible).toEqual(['SUBMITTED_BEFORE_RUN_END'])
    expect(row!.restarted).toBe(true)
  })
})
