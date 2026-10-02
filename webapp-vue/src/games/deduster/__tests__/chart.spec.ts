import { describe, expect, it } from 'vitest'
import type { DedusterRow } from '../scoreboard'
import {
  VIEW,
  frameFor,
  gridMs,
  levelAt,
  levelTicks,
  polyline,
  wrongTilesAt,
  xOf,
  yLabels,
  yOf,
} from '../chart'

function row(
  userId: string,
  reactionsMs: number[],
  endedBy: DedusterRow['endedBy'],
  wrongTileIndex: number | null = null,
): DedusterRow {
  return {
    userId,
    name: userId,
    colorHex: `#${userId.padEnd(6, '0')}`,
    ink: '#fff',
    points: 0,
    provisional: false,
    tick: 0,
    reactionsMs,
    tilesCleared: reactionsMs.length,
    averageLabel: '',
    levelLabel: '',
    out: null,
    endedBy,
    wrongTileIndex,
    implausible: false,
    restarted: false,
  }
}

describe('deduster chart', () => {
  const frame = frameFor({ tiles: 48, intervalMs: 1300, rows: [row('aa', [250, 400], 'TOO_LATE')] })

  it('spans level 0 to the tile count across the plot, the last tile one step short of the end', () => {
    expect(xOf(frame, 0)).toBe(VIEW.left)
    expect(xOf(frame, 48)).toBe(VIEW.width - VIEW.right)
    expect(xOf(frame, 47)).toBeLessThan(VIEW.width - VIEW.right)
  })

  it('labels every eighth level, the tile count at the end included', () => {
    expect(levelTicks(48)).toEqual([0, 8, 16, 24, 32, 40, 48])
    expect(levelTicks(49)).toEqual([0, 8, 16, 24, 32, 40, 48])
  })

  it('lays a grid line on every 300 ms between the floor and the beat', () => {
    // Fastest reaction 250 → floor 100.
    expect(frame.minMs).toBe(100)
    expect(gridMs(frame)).toEqual([300, 600, 900, 1200])
  })

  it('labels floor, grid and beat, dropping a grid label that would crowd the beat', () => {
    expect(yLabels(frame)).toEqual([100, 300, 600, 900, 1200, 1300])

    // At 1900 ms a beat, 1800 sits 100 ms — under 10 units — below it: its line stays, its label goes.
    const fast = frameFor({ tiles: 48, intervalMs: 1900, rows: [row('aa', [250], 'TOO_LATE')] })
    expect(gridMs(fast)).toContain(1800)
    expect(yLabels(fast)).not.toContain(1800)
    expect(yLabels(fast)).toContain(1900)
  })

  it('puts the beat inside the plot, with room above it for the game-over band', () => {
    expect(frame.maxMs).toBeGreaterThan(1300)
    expect(yOf(frame, frame.maxMs)).toBe(VIEW.top)
    expect(yOf(frame, frame.minMs)).toBe(VIEW.height - VIEW.bottom)
  })

  it('draws one point per reaction', () => {
    expect(polyline(frame, [250, 400]).split(' ')).toHaveLength(2)
  })

  it('scrubs to the nearest level, clamped to the grid', () => {
    expect(levelAt(frame, xOf(frame, 12) + 1)).toBe(12)
    expect(levelAt(frame, -50)).toBe(0)
    expect(levelAt(frame, 9999)).toBe(47)
  })

  it('reports the wrong taps of exactly the scrubbed level, several players on one tile', () => {
    const rows = [
      row('aa', [300, 300], 'WRONG_TILE', 17),
      row('bb', [300, 300], 'WRONG_TILE', 17),
      row('cc', [300], 'WRONG_TILE', 4),
      row('dd', [300, 300], 'TOO_LATE'),
    ]

    expect(wrongTilesAt(2, rows)).toEqual([
      {
        tile: 17,
        players: [
          { userId: 'aa', colorHex: '#aa0000' },
          { userId: 'bb', colorHex: '#bb0000' },
        ],
      },
    ])
    expect(wrongTilesAt(1, rows)).toEqual([
      { tile: 4, players: [{ userId: 'cc', colorHex: '#cc0000' }] },
    ])
  })
})
