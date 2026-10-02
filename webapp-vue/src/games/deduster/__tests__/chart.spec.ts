import { describe, expect, it } from 'vitest'
import type { DedusterRow } from '../scoreboard'
import {
  VIEW,
  correctBars,
  frameFor,
  gridMs,
  levelAt,
  levelTicks,
  polyline,
  runAt,
  tailOf,
  warningsOf,
  wrongBars,
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
    wrongReactionMs: null,
    implausible: false,
    restarted: false,
  }
}

describe('deduster chart', () => {
  const frame = frameFor({ tiles: 48, intervalMs: 1300, rows: [row('aa', [250, 400], 'TOO_LATE')] })

  it('spans level 0 to the last tile across the plot', () => {
    expect(xOf(frame, 0)).toBe(VIEW.left)
    expect(xOf(frame, 47)).toBe(VIEW.width - VIEW.right)
  })

  it('labels every fifth level, never one past the last tile', () => {
    expect(levelTicks(48)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45])
    expect(levelTicks(49)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45])
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

  it('runs a wrong tap on to where it happened, a timeout up into the band', () => {
    const wrong = { ...row('aa', [250, 400], 'WRONG_TILE', 7), wrongReactionMs: 300 }
    expect(tailOf(frame, wrong)).toEqual({
      from: { x: xOf(frame, 1), y: yOf(frame, 400) },
      to: { x: xOf(frame, 2), y: yOf(frame, 300) },
    })

    expect(tailOf(frame, row('aa', [250, 400], 'TOO_LATE'))).toEqual({
      from: { x: xOf(frame, 1), y: yOf(frame, 400) },
      to: { x: xOf(frame, 2), y: yOf(frame, frame.maxMs) },
    })
  })

  it('has no tail for a finished run, nor for a wrong tap without a time', () => {
    expect(tailOf(frame, row('aa', Array(48).fill(400), 'COMPLETE'))).toBeNull()
    expect(tailOf(frame, row('aa', [250], 'WRONG_TILE', 7))).toBeNull()
  })

  it('starts a tail at level 0 without a line to come from', () => {
    const first = { ...row('aa', [], 'WRONG_TILE', 7), wrongReactionMs: 300 }
    expect(tailOf(frame, first)).toEqual({
      from: null,
      to: { x: xOf(frame, 0), y: yOf(frame, 300) },
    })
  })

  it('picks the one run whose line passes the tap, and none when two do', () => {
    const rows = [row('aa', [300, 320, 310], 'COMPLETE'), row('bb', [400, 420, 410], 'COMPLETE')]
    const at = (level: number, ms: number) => ({ x: xOf(frame, level), y: yOf(frame, ms) })

    expect(runAt(frame, rows, at(1, 322), 6)).toBe('aa')
    expect(runAt(frame, rows, at(1, 418), 6)).toBe('bb')
    // Between both lines and within reach of each: no guess.
    expect(runAt(frame, rows, at(1, 370), 20)).toBeNull()
    expect(runAt(frame, rows, at(30, 900), 6)).toBeNull()
  })

  it('counts a run’s dashed ending as part of its line', () => {
    const rows = [row('aa', [300], 'TOO_LATE')]
    const midway = {
      x: (xOf(frame, 0) + xOf(frame, 1)) / 2,
      y: (yOf(frame, 300) + yOf(frame, frame.maxMs)) / 2,
    }

    expect(runAt(frame, rows, midway, 3)).toBe('aa')
  })

  it('gives the right tile one slot per player, in table order, empty without a value', () => {
    const rows = [
      row('aa', [300, 320], 'COMPLETE'),
      row('bb', [300], 'WRONG_TILE', 7),
      row('cc', [300], 'TOO_LATE'),
      { ...row('dd', [300, 110], 'TOO_LATE'), implausible: true },
    ]

    expect(correctBars({ level: 1, rows, intervalMs: 1300 })).toEqual([
      { userId: 'aa', colorHex: '#aa0000', kind: 'hit', ms: 320, warn: false },
      null,
      // Missed the beat: as on the curve, up to the band's top.
      { userId: 'cc', colorHex: '#cc0000', kind: 'missed', ms: 1456, warn: false },
      { userId: 'dd', colorHex: '#dd0000', kind: 'hit', ms: 110, warn: true },
    ])
  })

  it('gives a wrong tile the wrong taps that landed on it, in the same slots', () => {
    const rows = [
      row('aa', [300, 320], 'COMPLETE'),
      { ...row('bb', [300], 'WRONG_TILE', 7), wrongReactionMs: 250 },
      { ...row('cc', [300], 'WRONG_TILE', 9), wrongReactionMs: 280 },
    ]

    expect(wrongBars({ level: 1, tile: 7, rows })).toEqual([
      null,
      { userId: 'bb', colorHex: '#bb0000', kind: 'wrong', ms: 250, warn: false },
      null,
    ])
  })

  it('warns at the reactions that made a run implausible, and only on a marked run', () => {
    const marked = { ...row('aa', [110, 400, 1400], 'TOO_LATE'), implausible: true }

    // Low on the plot the sign hangs below its point, high up above it: away from the crowd.
    expect(warningsOf(frame, marked)).toEqual([
      { x: xOf(frame, 0), y: yOf(frame, 110), below: true },
      { x: xOf(frame, 2), y: yOf(frame, 1400), below: false },
    ])
    expect(warningsOf(frame, row('aa', [110], 'TOO_LATE'))).toEqual([])
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
