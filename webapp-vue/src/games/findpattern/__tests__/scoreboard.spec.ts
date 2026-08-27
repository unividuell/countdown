import { describe, expect, it } from 'vitest'
import type { GameEntry } from '@/games/GameEntry'
import { formatDuration, hasDurations, scoreRows, toneChips } from '@/games/findpattern/scoreboard'
import type { FindPatternSolution } from '@/games/findpattern/types'

const SOLUTION: FindPatternSolution = {
  // 0,1,2,3 repeating — the sought run 1,2,3,0 starts at 1, 5, 9, …
  blocks: Array.from({ length: 112 }, (_, index) => index % 4),
  pattern: [1, 2, 3, 0],
  palette: ['#ffffff', '#cccccc', '#999999', '#666666'],
  delta: 0.14,
  startIndices: [1, 5, 9],
}

function entry(over: Partial<GameEntry> & { userId: string }): GameEntry {
  return {
    username: over.userId,
    stage: 0,
    guess: null,
    outcome: null,
    points: 0,
    durationMs: null,
    avatar: { bgColorHex: '#7c3aed' },
    ...over,
  }
}

describe('formatDuration', () => {
  it('is mm:ss, and minutes are not capped at 59', () => {
    expect(formatDuration(0)).toBe('00:00')
    expect(formatDuration(9_400)).toBe('00:09')
    expect(formatDuration(61_000)).toBe('01:01')
    expect(formatDuration(3_600_000)).toBe('60:00')
  })

  it('is null where the round did not score on time', () => {
    expect(formatDuration(null)).toBeNull()
  })
})

describe('toneChips', () => {
  it('pairs every tone with its colour and readable ink', () => {
    expect(toneChips([0, 3], SOLUTION.palette)).toEqual([
      { value: 0, hex: '#ffffff', ink: '#111111' },
      { value: 3, hex: '#666666', ink: '#ffffff' },
    ])
  })
})

describe('scoreRows', () => {
  it('reads each tip off the board, so a row cannot contradict its own chips', () => {
    const rows = scoreRows({
      entries: [entry({ userId: 'a', guess: { startIndex: 5 }, points: 1 })],
      solution: SOLUTION,
      awardRule: 'ALL_QUALIFYING',
      mineUserId: 'a',
    })

    expect(rows[0]!.chips.map((chip) => chip.value)).toEqual([1, 2, 3, 0])
    expect(rows[0]!.correct).toBe(true)
  })

  it('marks a miss as a miss', () => {
    const rows = scoreRows({
      entries: [entry({ userId: 'a', guess: { startIndex: 4 }, points: 0 })],
      solution: SOLUTION,
      awardRule: 'ALL_QUALIFYING',
      mineUserId: 'a',
    })

    expect(rows[0]!.correct).toBe(false)
    expect(rows[0]!.chips.map((chip) => chip.value)).toEqual([0, 1, 2, 3])
  })

  it('shows a give-up row without chips', () => {
    const rows = scoreRows({
      entries: [entry({ userId: 'a', guess: null, points: 0 })],
      solution: SOLUTION,
      awardRule: 'CLOSEST_ONLY',
      mineUserId: 'a',
    })

    expect(rows[0]!.gaveUp).toBe(true)
    expect(rows[0]!.chips).toEqual([])
    expect(rows[0]!.correct).toBe(false)
  })

  it('ranks points first, then hits, then the clock', () => {
    const rows = scoreRows({
      entries: [
        entry({ userId: 'slow-hit', guess: { startIndex: 9 }, points: 0, durationMs: 30_000 }),
        entry({ userId: 'miss', guess: { startIndex: 4 }, points: 0, durationMs: 1_000 }),
        entry({ userId: 'winner', guess: { startIndex: 1 }, points: 3, durationMs: 12_000 }),
        entry({ userId: 'quick-hit', guess: { startIndex: 5 }, points: 0, durationMs: 4_000 }),
      ],
      solution: SOLUTION,
      awardRule: 'CLOSEST_ONLY',
      mineUserId: 'winner',
    })

    expect(rows.map((row) => row.userId)).toEqual(['winner', 'quick-hit', 'slow-hit', 'miss'])
  })

  it('is stable across reloads when nothing separates two rows', () => {
    const rows = scoreRows({
      entries: [
        entry({ userId: 'b', guess: { startIndex: 5 }, points: 1 }),
        entry({ userId: 'a', guess: { startIndex: 9 }, points: 1 }),
      ],
      solution: SOLUTION,
      awardRule: 'ALL_QUALIFYING',
      mineUserId: 'a',
    })

    expect(rows.map((row) => row.userId)).toEqual(['a', 'b'])
  })

  it('breaks the clock tie by milliseconds, not by comparing the mm:ss label as text', () => {
    // "100:00" sorts before "60:00" as text ('1' < '6'), but 6_000_000 ms is the slower duration.
    const rows = scoreRows({
      entries: [
        entry({
          userId: 'hundred-minutes',
          guess: { startIndex: 1 },
          points: 0,
          durationMs: 6_000_000,
        }),
        entry({
          userId: 'sixty-minutes',
          guess: { startIndex: 5 },
          points: 0,
          durationMs: 3_600_000,
        }),
      ],
      solution: SOLUTION,
      awardRule: 'CLOSEST_ONLY',
      mineUserId: 'sixty-minutes',
    })

    expect(rows.map((row) => row.userId)).toEqual(['sixty-minutes', 'hundred-minutes'])
  })

  it('calls a closest-only score provisional while it can still be overtaken', () => {
    const rows = scoreRows({
      entries: [
        entry({ userId: 'a', guess: { startIndex: 5 }, points: 3 }),
        entry({ userId: 'b', guess: { startIndex: 4 }, points: 0 }),
      ],
      solution: SOLUTION,
      awardRule: 'CLOSEST_ONLY',
      mineUserId: 'a',
    })

    expect(rows[0]!.provisional).toBe(true)
    expect(rows[1]!.provisional).toBe(false)
  })

  /** My own row waits for the first foreign one — the shared choreography's rule. */
  it('gives my own row the tick of the first row that is not mine', () => {
    const rows = scoreRows({
      entries: [
        entry({ userId: 'mine', guess: { startIndex: 5 }, points: 3 }),
        entry({ userId: 'other', guess: { startIndex: 4 }, points: 0 }),
      ],
      solution: SOLUTION,
      awardRule: 'CLOSEST_ONLY',
      mineUserId: 'mine',
    })

    expect(rows[0]!.tick).toBe(1)
    expect(rows[1]!.tick).toBe(1)
  })
})

describe('hasDurations', () => {
  it('is false for a phase-one round, so the column can stay away', () => {
    const rows = scoreRows({
      entries: [entry({ userId: 'a', guess: { startIndex: 5 }, points: 1 })],
      solution: SOLUTION,
      awardRule: 'ALL_QUALIFYING',
      mineUserId: 'a',
    })

    expect(hasDurations(rows)).toBe(false)
  })

  it('is true as soon as one row carries a duration', () => {
    const rows = scoreRows({
      entries: [entry({ userId: 'a', guess: { startIndex: 5 }, points: 3, durationMs: 1_000 })],
      solution: SOLUTION,
      awardRule: 'CLOSEST_ONLY',
      mineUserId: 'a',
    })

    expect(hasDurations(rows)).toBe(true)
  })
})
