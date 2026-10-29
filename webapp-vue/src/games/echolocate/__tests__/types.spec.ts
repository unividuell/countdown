import { describe, expect, it } from 'vitest'
import {
  asEcho,
  asEchoLocateGuess,
  asEchoLocateOutcome,
  asEchoLocatePayload,
  asEchoLocateSolution,
  asPing,
  pinsOf,
  ringsOf,
} from '@/games/echolocate/types'
import type { EchoLocatePayload } from '@/games/echolocate/types'

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

describe('asEchoLocatePayload', () => {
  it('narrows a payload with one or two clips and keeps a null tolerance', () => {
    expect(asEchoLocatePayload(PAYLOAD)).toEqual(PAYLOAD)
    expect(asEchoLocatePayload(TWO)).toEqual(TWO)
    expect(asEchoLocatePayload({ ...PAYLOAD, toleranceCells: null })).toEqual({
      ...PAYLOAD,
      toleranceCells: null,
    })
  })

  it('hands back a copy, not the raw object', () => {
    const raw = { ...PAYLOAD }

    expect(asEchoLocatePayload(raw)).not.toBe(raw)
  })

  it.each([
    ['null', null],
    ['a number', 7],
    ['a list', [PAYLOAD]],
    ['another game’s payload', { width: 1200, height: 900, brushes: [40], tolerance: 0.05 }],
    ['three clips', { ...PAYLOAD, clips: 3 }],
    ['no clips', { ...PAYLOAD, clips: 0 }],
    ['clips as text', { ...PAYLOAD, clips: '1' }],
    ['a missing clips field', { ...PAYLOAD, clips: undefined }],
    ['a fractional tolerance', { ...PAYLOAD, toleranceCells: 1.5 }],
    ['a negative tolerance', { ...PAYLOAD, toleranceCells: -1 }],
    ['a tolerance as text', { ...PAYLOAD, toleranceCells: '1' }],
    ['a missing tolerance', { ...PAYLOAD, toleranceCells: undefined }],
    ['a NaN reach', { ...PAYLOAD, reach: NaN }],
    ['no reach', { ...PAYLOAD, reach: 0 }],
    ['an infinite speed', { ...PAYLOAD, speed: Infinity }],
    ['no speed', { ...PAYLOAD, speed: 0 }],
    ['a field without cells', { ...PAYLOAD, grid: 0 }],
    ['a fractional grid', { ...PAYLOAD, grid: 20.5 }],
    ['a negative ping count', { ...PAYLOAD, pings: -1 }],
    ['a fractional ping count', { ...PAYLOAD, pings: 2.5 }],
    ['a NaN bed level', { ...PAYLOAD, bedDb: NaN }],
    ['a missing bed level', { ...PAYLOAD, bedDb: undefined }],
    ['a noise level as text', { ...PAYLOAD, noiseDb: '0' }],
  ])('turns %s into null', (_label, payload) => {
    expect(asEchoLocatePayload(payload)).toBeNull()
  })
})

describe('asEcho', () => {
  const CLIP = { sound: 'CLIP', clip: 1, delayMs: 1667 }
  const BIRDS = { sound: 'BIRDS', clip: null, delayMs: 2000 }

  it('narrows the hits of an answer, a silent one included', () => {
    expect(asEcho({ hits: [CLIP, BIRDS] })).toEqual([CLIP, BIRDS])
    expect(asEcho({ hits: [] })).toEqual([])
  })

  it('knows every noise the server names', () => {
    for (const sound of ['BIRDS', 'BROOK', 'COW', 'WIND', 'RAIN']) {
      expect(asEcho({ hits: [{ sound, clip: null, delayMs: 0 }] })).toHaveLength(1)
    }
  })

  it.each([
    ['null', null],
    ['a list', [CLIP]],
    ['no hits field', {}],
    ['hits that are no list', { hits: CLIP }],
    ['a hit that is no object', { hits: [7] }],
    ['an unknown sound', { hits: [{ ...BIRDS, sound: 'VOICE' }] }],
    ['a lower-case sound', { hits: [{ ...BIRDS, sound: 'birds' }] }],
    ['a clip hit without its clip', { hits: [{ ...CLIP, clip: null }] }],
    ['a clip hit with a negative clip', { hits: [{ ...CLIP, clip: -1 }] }],
    ['a clip hit with a fractional clip', { hits: [{ ...CLIP, clip: 0.5 }] }],
    ['a noise hit that names a clip', { hits: [{ ...BIRDS, clip: 0 }] }],
    ['a hit without a clip field', { hits: [{ sound: 'BIRDS', delayMs: 100 }] }],
    ['a negative delay', { hits: [{ ...CLIP, delayMs: -1 }] }],
    ['a fractional delay', { hits: [{ ...CLIP, delayMs: 1.5 }] }],
    ['a NaN delay', { hits: [{ ...CLIP, delayMs: NaN }] }],
    ['a delay as text', { hits: [{ ...CLIP, delayMs: '5' }] }],
    ['one bad hit among good ones', { hits: [CLIP, { ...BIRDS, sound: 'VOICE' }] }],
  ])('turns %s into null', (_label, answer) => {
    expect(asEcho(answer)).toBeNull()
  })
})

describe('asPing', () => {
  it('reads a ping inside the field, edges included', () => {
    expect(asPing({ x: 7.31, y: 12.08 }, 20)).toEqual({ x: 7.31, y: 12.08 })
    expect(asPing({ x: 0, y: 0 }, 20)).toEqual({ x: 0, y: 0 })
    expect(asPing({ x: 20, y: 20 }, 20)).toEqual({ x: 20, y: 20 })
  })

  it.each([
    ['null', null],
    ['a list', [1, 2]],
    ['x left of the field', { x: -0.1, y: 5 }],
    ['x right of the field', { x: 20.1, y: 5 }],
    ['y above the field', { x: 5, y: -0.1 }],
    ['y below the field', { x: 5, y: 20.1 }],
    ['x as text', { x: '1', y: 5 }],
    ['a NaN y', { x: 5, y: NaN }],
    ['an infinite x', { x: Infinity, y: 5 }],
    ['a missing y', { x: 5 }],
    ['an extra field', { x: 5, y: 5, t: 1 }],
  ])('turns %s into null', (_label, ping) => {
    expect(asPing(ping, 20)).toBeNull()
  })

  it('measures against the field it is given', () => {
    expect(asPing({ x: 10.5, y: 3 }, 10)).toBeNull()
    expect(asPing({ x: 10, y: 3 }, 10)).toEqual({ x: 10, y: 3 })
  })
})

describe('asEchoLocateSolution', () => {
  const SOLUTION = {
    targets: [{ col: 3, row: 4 }],
    noises: [
      { cell: { col: 10, row: 2 }, kind: 'BIRDS' },
      { cell: { col: 0, row: 19 }, kind: 'RAIN' },
    ],
    toleranceCells: 1,
  }

  it('narrows a solution and keeps a null tolerance', () => {
    expect(asEchoLocateSolution(SOLUTION)).toEqual(SOLUTION)
    expect(asEchoLocateSolution({ ...SOLUTION, toleranceCells: null })).toEqual({
      ...SOLUTION,
      toleranceCells: null,
    })
  })

  it('takes two targets and no noises', () => {
    const solution = {
      targets: [
        { col: 1, row: 1 },
        { col: 9, row: 9 },
      ],
      noises: [],
      toleranceCells: null,
    }

    expect(asEchoLocateSolution(solution)).toEqual(solution)
  })

  it.each([
    ['null', null],
    ['no targets', { ...SOLUTION, targets: [] }],
    ['targets that are no list', { ...SOLUTION, targets: { col: 3, row: 4 } }],
    ['a target that is no cell', { ...SOLUTION, targets: [[3, 4]] }],
    ['a fractional column', { ...SOLUTION, targets: [{ col: 3.5, row: 4 }] }],
    ['a negative row', { ...SOLUTION, targets: [{ col: 3, row: -1 }] }],
    ['a row as text', { ...SOLUTION, targets: [{ col: 3, row: '4' }] }],
    ['a missing column', { ...SOLUTION, targets: [{ row: 4 }] }],
    ['noises that are no list', { ...SOLUTION, noises: 'BIRDS' }],
    ['a noise without a cell', { ...SOLUTION, noises: [{ kind: 'BIRDS' }] }],
    ['a noise on a bad cell', { ...SOLUTION, noises: [{ cell: { col: 1 }, kind: 'BIRDS' }] }],
    [
      'an unknown noise kind',
      { ...SOLUTION, noises: [{ cell: { col: 1, row: 1 }, kind: 'VOICE' }] },
    ],
    [
      'the clip as a noise kind',
      { ...SOLUTION, noises: [{ cell: { col: 1, row: 1 }, kind: 'CLIP' }] },
    ],
    ['a fractional tolerance', { ...SOLUTION, toleranceCells: 1.5 }],
    ['a missing tolerance', { ...SOLUTION, toleranceCells: undefined }],
    ['missing noises', { targets: SOLUTION.targets, toleranceCells: 1 }],
  ])('turns %s into null', (_label, solution) => {
    expect(asEchoLocateSolution(solution)).toBeNull()
  })
})

describe('asEchoLocateOutcome', () => {
  it('narrows an outcome and keeps a null verdict', () => {
    expect(asEchoLocateOutcome({ distance: 2.3, withinTolerance: true, pinOf: [0] }, 1)).toEqual({
      distance: 2.3,
      withinTolerance: true,
      pinOf: [0],
    })
    expect(asEchoLocateOutcome({ distance: 2.3, withinTolerance: null, pinOf: [1, 0] }, 2)).toEqual(
      { distance: 2.3, withinTolerance: null, pinOf: [1, 0] },
    )
  })

  it.each([
    ['null', null],
    ['a NaN distance', { distance: NaN, withinTolerance: true, pinOf: [0] }],
    ['a missing distance', { withinTolerance: true, pinOf: [0] }],
    ['a missing verdict', { distance: 2.3, pinOf: [0] }],
    ['a verdict that is no boolean', { distance: 2.3, withinTolerance: 'yes', pinOf: [0] }],
    ['a missing assignment', { distance: 2.3, withinTolerance: true }],
    ['an assignment that is no list', { distance: 2.3, withinTolerance: true, pinOf: 0 }],
    [
      'an assignment too long for the clips',
      { distance: 2.3, withinTolerance: true, pinOf: [0, 1] },
    ],
    ['an assignment too short for the clips', { distance: 2.3, withinTolerance: true, pinOf: [] }],
    ['a pin beyond the clips', { distance: 2.3, withinTolerance: true, pinOf: [1] }],
    ['a negative pin', { distance: 2.3, withinTolerance: true, pinOf: [-1] }],
    ['a fractional pin', { distance: 2.3, withinTolerance: true, pinOf: [0.5] }],
  ])('turns %s into null', (_label, outcome) => {
    expect(asEchoLocateOutcome(outcome, 1)).toBeNull()
  })

  it('counts the assignment against the clips of the round', () => {
    const outcome = { distance: 2.3, withinTolerance: true, pinOf: [0] }

    expect(asEchoLocateOutcome(outcome, 2)).toBeNull()
    expect(asEchoLocateOutcome({ ...outcome, pinOf: [0, 2] }, 2)).toBeNull()
  })
})

describe('asEchoLocateGuess', () => {
  const GUESS = { pins: [{ x: 9.62, y: 4.1 }], rings: [[5.81], [], [7.24]] }
  const GUESS_OF_TWO = {
    pins: [
      { x: 9.62, y: 4.1 },
      { x: 15.2, y: 13.9 },
    ],
    rings: [[5.81, 9.4], [], [7.24]],
  }

  it('narrows a guess for one clip and for two', () => {
    expect(asEchoLocateGuess(GUESS, PAYLOAD)).toEqual(GUESS)
    expect(asEchoLocateGuess(GUESS_OF_TWO, TWO)).toEqual(GUESS_OF_TWO)
  })

  it('accepts a guess without rings, and the edges of every range', () => {
    expect(asEchoLocateGuess({ pins: GUESS.pins, rings: [] }, PAYLOAD)).toEqual({
      pins: GUESS.pins,
      rings: [],
    })

    const edges = {
      pins: [
        { x: 0, y: 20 },
        { x: 20, y: 0 },
      ],
      rings: [[0, 40], [40, 0], []],
    }
    expect(asEchoLocateGuess(edges, TWO)).toEqual(edges)
  })

  it.each([
    ['null', null],
    ['a list', [GUESS]],
    ['no rings field', { pins: GUESS.pins }],
    ['no pins field', { rings: GUESS.rings }],
    ['an extra top-level field', { ...GUESS, note: 'x' }],
    ['pins that are no list', { ...GUESS, pins: GUESS.pins[0] }],
    ['no pins at all', { ...GUESS, pins: [] }],
    ['more pins than clips', { ...GUESS, pins: [...GUESS.pins, { x: 1, y: 1 }] }],
    ['a pin that is no object', { ...GUESS, pins: [[1, 2]] }],
    ['a pin with an extra field', { ...GUESS, pins: [{ x: 1, y: 1, name: 'a' }] }],
    ['a pin without y', { ...GUESS, pins: [{ x: 1 }] }],
    ['a pin left of the field', { ...GUESS, pins: [{ x: -0.1, y: 1 }] }],
    ['a pin right of the field', { ...GUESS, pins: [{ x: 20.1, y: 1 }] }],
    ['a pin below the field', { ...GUESS, pins: [{ x: 1, y: 20.1 }] }],
    ['a pin coordinate as text', { ...GUESS, pins: [{ x: '1', y: 1 }] }],
    ['a NaN pin coordinate', { ...GUESS, pins: [{ x: 1, y: NaN }] }],
    ['rings that are no list', { ...GUESS, rings: 5 }],
    ['more ring lists than pings', { ...GUESS, rings: [[1], [1], [1], [1]] }],
    ['a ring list that is no list', { ...GUESS, rings: [5] }],
    ['more radii than clips', { ...GUESS, rings: [[1, 2]] }],
    ['a negative radius', { ...GUESS, rings: [[-0.1]] }],
    ['a radius past twice the field', { ...GUESS, rings: [[40.1]] }],
    ['a NaN radius', { ...GUESS, rings: [[NaN]] }],
    ['an infinite radius', { ...GUESS, rings: [[Infinity]] }],
    ['a radius as text', { ...GUESS, rings: [['5']] }],
  ])('turns %s into null', (_label, guess) => {
    expect(asEchoLocateGuess(guess, PAYLOAD)).toBeNull()
  })

  it('wants exactly the clips of the round in pins', () => {
    expect(asEchoLocateGuess(GUESS, TWO)).toBeNull()
    expect(asEchoLocateGuess(GUESS_OF_TWO, PAYLOAD)).toBeNull()
  })

  it('measures pins and rings against the round’s own field and pings', () => {
    const small = { ...PAYLOAD, grid: 10, pings: 1 }

    expect(asEchoLocateGuess({ pins: [{ x: 10.5, y: 1 }], rings: [] }, small)).toBeNull()
    expect(asEchoLocateGuess({ pins: [{ x: 1, y: 1 }], rings: [[20.5]] }, small)).toBeNull()
    expect(asEchoLocateGuess({ pins: [{ x: 1, y: 1 }], rings: [[1], [1]] }, small)).toBeNull()
    expect(asEchoLocateGuess({ pins: [{ x: 10, y: 1 }], rings: [[20]] }, small)).not.toBeNull()
  })

  it('hands back copies, not the raw objects', () => {
    const guess = asEchoLocateGuess(GUESS, PAYLOAD)

    expect(guess?.pins[0]).not.toBe(GUESS.pins[0])
    expect(guess?.rings[0]).not.toBe(GUESS.rings[0])
  })
})

describe('pinsOf / ringsOf', () => {
  const PIN = { x: 1, y: 2 }

  it('lets a draft hold fewer pins than clips, and no more', () => {
    expect(pinsOf([PIN], TWO, { complete: false })).toEqual([PIN])
    expect(pinsOf([], TWO, { complete: false })).toEqual([])
    expect(pinsOf([PIN], TWO, { complete: true })).toBeNull()
    expect(pinsOf([PIN, PIN, PIN], TWO, { complete: false })).toBeNull()
  })

  it('reads rings by ping', () => {
    expect(ringsOf([[1, 2], [], [3]], TWO)).toEqual([[1, 2], [], [3]])
    expect(ringsOf([[1, 2, 3]], TWO)).toBeNull()
  })
})
