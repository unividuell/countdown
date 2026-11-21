import { describe, expect, it } from 'vitest'
import {
  asTurnPipesGuess,
  asTurnPipesOutcome,
  asTurnPipesPayload,
  asTurnPipesScene,
  asTurnPipesSolution,
} from '@/games/turnpipes/types'

/** A 6×6 board: the inlet and the outlet on the rim, elbows and straights between. */
function payload(over: Record<string, unknown> = {}) {
  const kinds: string[] = Array.from({ length: 36 }, (_, i) => (i % 2 === 0 ? 'STRAIGHT' : 'ELBOW'))
  kinds[0] = 'INLET'
  kinds[35] = 'OUTLET'

  return { size: 6, kinds, start: Array.from({ length: 36 }, (_, i) => i % 4), ...over }
}

describe('asTurnPipesScene', () => {
  it('keeps a size within the limits', () => {
    expect(asTurnPipesScene({ size: 7 })).toEqual({ size: 7 })
  })

  it('drops a size outside them', () => {
    expect(asTurnPipesScene({ size: 5 })).toBeNull()
    expect(asTurnPipesScene({ size: 9 })).toBeNull()
    expect(asTurnPipesScene({ size: 6.5 })).toBeNull()
    expect(asTurnPipesScene(null)).toBeNull()
  })
})

describe('asTurnPipesPayload', () => {
  it('keeps a well-formed payload', () => {
    expect(asTurnPipesPayload(payload())).toEqual(payload())
  })

  it('drops a size outside the limits', () => {
    expect(asTurnPipesPayload(payload({ size: 5 }))).toBeNull()
    expect(asTurnPipesPayload(payload({ size: 9 }))).toBeNull()
  })

  it('drops kinds of the wrong length or with an unknown code', () => {
    expect(asTurnPipesPayload(payload({ kinds: payload().kinds.slice(1) }))).toBeNull()
    const unknown = payload().kinds
    unknown[3] = 'CROSS'
    expect(asTurnPipesPayload(payload({ kinds: unknown }))).toBeNull()
  })

  it('wants exactly one inlet and one outlet', () => {
    const twice = payload().kinds
    twice[2] = 'INLET'
    expect(asTurnPipesPayload(payload({ kinds: twice }))).toBeNull()

    const none = payload().kinds
    none[35] = 'ELBOW'
    expect(asTurnPipesPayload(payload({ kinds: none }))).toBeNull()
  })

  it('drops a start with a bad turn or the wrong length', () => {
    const start = payload().start
    expect(asTurnPipesPayload(payload({ start: start.slice(1) }))).toBeNull()
    expect(asTurnPipesPayload(payload({ start: [...start.slice(1), 4] }))).toBeNull()
    expect(asTurnPipesPayload(payload({ start: [...start.slice(1), Number.NaN] }))).toBeNull()
    expect(asTurnPipesPayload(payload({ start: [...start.slice(1), -1] }))).toBeNull()
  })
})

describe('asTurnPipesSolution', () => {
  it('keeps whole numbers', () => {
    const solution = { rotations: [0, 1, 2, 3], path: [0, 1, 7] }

    expect(asTurnPipesSolution(solution)).toEqual(solution)
  })

  it('drops anything else', () => {
    expect(asTurnPipesSolution({ rotations: [0, 1.5], path: [0] })).toBeNull()
    expect(asTurnPipesSolution({ rotations: [0], path: [Number.NaN] })).toBeNull()
    expect(asTurnPipesSolution({ rotations: [0] })).toBeNull()
  })
})

describe('asTurnPipesOutcome', () => {
  it('keeps a hit without a leak', () => {
    const outcome = { correct: true, wet: [0, 1, 2], leak: null }

    expect(asTurnPipesOutcome(outcome)).toEqual(outcome)
  })

  it('keeps a leak into the open and one into a cell', () => {
    const open = { correct: false, wet: [0], leak: { at: null, from: 3 } }
    const cell = { correct: false, wet: [0, 1], leak: { at: 7, from: 1 } }

    expect(asTurnPipesOutcome(open)).toEqual(open)
    expect(asTurnPipesOutcome(cell)).toEqual(cell)
  })

  it('drops a wet cell that is no cell', () => {
    expect(asTurnPipesOutcome({ correct: true, wet: [-1], leak: null })).toBeNull()
    expect(asTurnPipesOutcome({ correct: true, wet: [1.5], leak: null })).toBeNull()
  })

  it('drops a broken leak or flag', () => {
    expect(asTurnPipesOutcome({ correct: 'yes', wet: [], leak: null })).toBeNull()
    expect(asTurnPipesOutcome({ correct: false, wet: [], leak: { at: 1 } })).toBeNull()
    expect(asTurnPipesOutcome({ correct: false, wet: [], leak: 'x' })).toBeNull()
  })
})

describe('asTurnPipesGuess', () => {
  it('keeps whole rotations', () => {
    expect(asTurnPipesGuess({ rotations: [0, 3, 1] })).toEqual({ rotations: [0, 3, 1] })
  })

  it('drops anything else', () => {
    expect(asTurnPipesGuess({ rotations: [0, 0.5] })).toBeNull()
    expect(asTurnPipesGuess({ rotations: 'x' })).toBeNull()
    expect(asTurnPipesGuess(null)).toBeNull()
  })
})
