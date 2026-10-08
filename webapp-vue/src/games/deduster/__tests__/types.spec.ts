import { describe, expect, it } from 'vitest'
import { asDedusterGuess, asDedusterOutcome, asDedusterPayload, asDedusterScene } from '../types'

describe('deduster types', () => {
  it('narrows a scene', () => {
    expect(asDedusterScene({ cols: 6, rows: 8, intervalMs: 1300 })).toEqual({
      cols: 6,
      rows: 8,
      intervalMs: 1300,
    })
    expect(asDedusterScene({ cols: 6, rows: 8 })).toBeNull()
    expect(asDedusterScene({ cols: 6.5, rows: 8, intervalMs: 1300 })).toBeNull()
  })

  it('takes a payload only when its order is a permutation of the grid', () => {
    const base = { cols: 2, rows: 2, intervalMs: 900 }
    expect(asDedusterPayload({ ...base, order: [2, 0, 3, 1] })).toEqual({
      ...base,
      order: [2, 0, 3, 1],
    })
    expect(asDedusterPayload({ ...base, order: [0, 0, 1, 2] })).toBeNull()
    expect(asDedusterPayload({ ...base, order: [0, 1, 2] })).toBeNull()
    expect(asDedusterPayload({ ...base, order: [0, 1, 2, 4] })).toBeNull()
  })

  it('narrows a stored guess', () => {
    expect(
      asDedusterGuess({
        reactionsMs: [300],
        endedBy: 'WRONG_TILE',
        wrongTileIndex: 4,
        wrongReactionMs: 350,
        restarted: false,
      }),
    ).toEqual({
      reactionsMs: [300],
      endedBy: 'WRONG_TILE',
      wrongTileIndex: 4,
      wrongReactionMs: 350,
      restarted: false,
    })
    // A guess stored before the field existed still reads, without the wrong tap's time.
    expect(
      asDedusterGuess({
        reactionsMs: [300],
        endedBy: 'TOO_LATE',
        wrongTileIndex: null,
        restarted: false,
      })?.wrongReactionMs,
    ).toBeNull()
    expect(
      asDedusterGuess({
        reactionsMs: [300],
        endedBy: 'BORED',
        wrongTileIndex: null,
        restarted: false,
      }),
    ).toBeNull()
    expect(asDedusterGuess(null)).toBeNull()
  })

  it('narrows an outcome, average included or absent', () => {
    const outcome = {
      tilesCleared: 0,
      endedBy: 'TOO_LATE',
      wrongTileIndex: null,
      averageReactionMs: null,
      implausible: ['REACTION_BELOW_HUMAN', 'SUBMITTED_BEFORE_RUN_END'],
      restarted: true,
    }
    expect(asDedusterOutcome(outcome)).toEqual(outcome)
    expect(asDedusterOutcome({ ...outcome, averageReactionMs: 'fast' })).toBeNull()
    expect(asDedusterOutcome({ ...outcome, implausible: true })).toBeNull()
    expect(asDedusterOutcome({ ...outcome, implausible: ['TOO_PRETTY'] })).toBeNull()
  })
})
