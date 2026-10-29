import { describe, expect, it } from 'vitest'
import { gameEntry } from '@/games/__tests__/gameFixtures'
import type { GameEntry } from '@/games/GameEntry'
import { formatDistance, scoreRows } from '@/games/echolocate/scoreboard'
import type { EchoLocateOutcome, EchoLocatePayload } from '@/games/echolocate/types'

const PAYLOAD: EchoLocatePayload = {
  grid: 20,
  reach: 12,
  speed: 3,
  pings: 3,
  clips: 1,
  bedDb: -24,
  noiseDb: 0,
  toleranceCells: 1,
}
const TWO: EchoLocatePayload = { ...PAYLOAD, clips: 2 }

const GUESS = { pins: [{ x: 9.6, y: 4.1 }], rings: [[5.8], [], [7.2]] }
const PINGS = [
  { x: 3, y: 4 },
  { x: 10, y: 11.5 },
]

function outcome(distance: number): EchoLocateOutcome {
  return { distance, withinTolerance: true, pinOf: [0] }
}

/** A judged entry with a guess and two pings of its own. */
function entry(over: Partial<GameEntry>): GameEntry {
  return gameEntry({
    guess: GUESS,
    outcome: outcome(1),
    points: 1,
    steps: PINGS,
    ...over,
  })
}

function rowsOf(
  entries: GameEntry[],
  over: {
    awardRule?: 'ALL_QUALIFYING' | 'CLOSEST_ONLY' | null
    mineUserId?: string | null
    payload?: EchoLocatePayload
  } = {},
) {
  return scoreRows({
    entries,
    awardRule: over.awardRule ?? 'ALL_QUALIFYING',
    mineUserId: over.mineUserId ?? null,
    payload: over.payload ?? PAYLOAD,
  })
}

describe('formatDistance', () => {
  it('labels the distance with one decimal, the mean of two with Ø', () => {
    expect(formatDistance(2.345, 1)).toBe('2,3')
    expect(formatDistance(2.345, 2)).toBe('Ø 2,3')
    expect(formatDistance(0, 1)).toBe('0,0')
    expect(formatDistance(12, 2)).toBe('Ø 12,0')
  })
})

describe('scoreRows', () => {
  it('ranks by distance, give-ups last, userId as tiebreak', () => {
    const rows = rowsOf([
      entry({ userId: 'e', outcome: { distance: 'x' } }),
      entry({ userId: 'd', outcome: outcome(2) }),
      entry({ userId: 'a', outcome: outcome(5.5) }),
      entry({ userId: 'c', outcome: null, guess: null }),
      entry({ userId: 'b', outcome: outcome(2) }),
      entry({ userId: 'f', outcome: outcome(0.4) }),
    ])

    expect(rows.map((row) => row.userId)).toEqual(['f', 'b', 'd', 'a', 'c', 'e'])
  })

  it('labels the distance, the mean of two clips with Ø', () => {
    const [one] = rowsOf([entry({ outcome: outcome(2.345) })])
    const [two] = rowsOf(
      [
        entry({
          outcome: { distance: 2.345, withinTolerance: true, pinOf: [1, 0] },
          guess: {
            pins: [
              { x: 1, y: 1 },
              { x: 2, y: 2 },
            ],
            rings: [],
          },
        }),
      ],
      { payload: TWO },
    )

    expect(one!.distanceLabel).toBe('2,3')
    expect(two!.distanceLabel).toBe('Ø 2,3')
  })

  it('reads every player’s pings from their steps', () => {
    // An entry from a host that carries no steps at all.
    const withoutSteps = entry({ userId: 'd', outcome: outcome(4) })
    delete withoutSteps.steps

    const rows = rowsOf([
      entry({ userId: 'a', outcome: outcome(1), steps: PINGS }),
      entry({ userId: 'b', outcome: outcome(2), steps: [{ x: 7, y: 8 }] }),
      entry({ userId: 'c', outcome: outcome(3), steps: [] }),
      withoutSteps,
    ])

    expect(rows.map((row) => [row.userId, row.pings])).toEqual([
      ['a', PINGS],
      ['b', [{ x: 7, y: 8 }]],
      ['c', []],
      ['d', []],
    ])
  })

  it('draws no ping from a step it cannot read, rather than shift the others', () => {
    const [row] = rowsOf([entry({ steps: [{ x: 3, y: 4 }, null, { x: 99, y: 1 }] })])

    expect(row!.pings).toEqual([])
    expect(row!.guess).toEqual(GUESS)
  })

  it('carries the guess and the server’s assignment of pins to clips', () => {
    const [row] = rowsOf([entry({ outcome: { distance: 1, withinTolerance: null, pinOf: [0] } })])

    expect(row!.guess).toEqual(GUESS)
    expect(row!.pinOf).toEqual([0])
  })

  it('carries the head every game shares', () => {
    const [row] = rowsOf(
      [entry({ userId: 'me', username: 'Mia', points: 7, avatar: { bgColorHex: '#7d2ae8' } })],
      { awardRule: 'CLOSEST_ONLY' },
    )

    expect(row).toMatchObject({
      userId: 'me',
      name: 'Mia',
      colorHex: '#7d2ae8',
      points: 7,
      provisional: true,
    })
  })

  it('keeps a row with an unreadable guess or outcome, last, without pings', () => {
    const rows = rowsOf([
      entry({ userId: 'bad-guess', outcome: outcome(0.2), guess: { pins: [{ x: 99, y: 1 }] } }),
      entry({ userId: 'bad-outcome', outcome: { distance: NaN, pinOf: [0] } }),
      entry({ userId: 'ok-far', outcome: outcome(9) }),
      entry({ userId: 'ok-near', outcome: outcome(1) }),
    ])

    const byId = Object.fromEntries(rows.map((row) => [row.userId, row]))
    expect(rows.map((row) => row.userId)).toEqual(['ok-near', 'ok-far', 'bad-guess', 'bad-outcome'])
    expect(byId['ok-near']!.pings).toEqual(PINGS)
    for (const id of ['bad-guess', 'bad-outcome']) {
      expect(byId[id], id).toMatchObject({
        distanceLabel: null,
        guess: null,
        pings: [],
        pinOf: null,
      })
    }
  })

  it('draws a guess with the wrong number of pins as unreadable', () => {
    const [row] = rowsOf([entry({ guess: GUESS })], { payload: TWO })

    expect(row).toMatchObject({ guess: null, pings: [], pinOf: null })
  })

  it('draws an assignment that does not fit the clips as unreadable', () => {
    const [row] = rowsOf([
      entry({ outcome: { distance: 1, withinTolerance: true, pinOf: [0, 1] } }),
    ])

    expect(row).toMatchObject({ distanceLabel: null, guess: null, pings: [], pinOf: null })
  })

  it('gives up rows no label, no guess and no pings, though they pinged', () => {
    const [row] = rowsOf([entry({ guess: null, outcome: null, points: 0 })])

    expect(row).toMatchObject({
      distanceLabel: null,
      guess: null,
      pings: [],
      pinOf: null,
      points: 0,
    })
  })

  it('stamps the reveal tick, my own row waiting for the first rival', () => {
    const rows = rowsOf(
      [
        entry({ userId: 'me', outcome: outcome(0.1) }),
        entry({ userId: 'b', outcome: outcome(2) }),
        entry({ userId: 'c', outcome: outcome(3) }),
      ],
      { mineUserId: 'me' },
    )

    expect(rows.map((row) => [row.userId, row.tick])).toEqual([
      ['me', 1],
      ['b', 1],
      ['c', 2],
    ])
  })
})
