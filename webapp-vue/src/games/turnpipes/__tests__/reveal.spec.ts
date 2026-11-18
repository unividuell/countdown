import { describe, expect, it } from 'vitest'
import { shownBoard } from '../reveal'
import type { ScoreRow } from '../scoreboard'
import type { TurnPipesOutcome, TurnPipesSolution } from '../types'

const LEAKY: TurnPipesOutcome = { correct: false, wet: [0, 1], leak: { at: 7, from: 1 } }
const THEIRS: TurnPipesOutcome = { correct: true, wet: [0, 1, 2], leak: null }
const SOLUTION: TurnPipesSolution = { rotations: [1, 1, 1], path: [0, 1, 2] }

function row(userId: string, outcome: TurnPipesOutcome | null, rotations: number[] | null) {
  return { userId, outcome, rotations } as ScoreRow
}

const input = {
  selectedUserId: null as string | null,
  mineUserId: 'me' as string | null,
  myRotations: [0, 0, 0] as number[] | null,
  myOutcome: LEAKY as TurnPipesOutcome | null,
  rows: [row('me', LEAKY, [0, 0, 0]), row('them', THEIRS, [2, 2, 2])],
  solution: SOLUTION as TurnPipesSolution | null,
}

describe('shownBoard', () => {
  it('my own tip shows my rotations and my water', () => {
    expect(shownBoard({ ...input, selectedUserId: 'me' })).toEqual({
      rotations: [0, 0, 0],
      wet: [0, 1],
      leak: { at: 7, from: 1 },
      endSound: 'leak',
    })
  })

  it('another name shows that tip', () => {
    expect(shownBoard({ ...input, selectedUserId: 'them' })).toEqual({
      rotations: [2, 2, 2],
      wet: [0, 1, 2],
      leak: null,
      endSound: 'success',
    })
  })

  it('nobody selected shows the solution, wet along its path', () => {
    expect(shownBoard(input)).toEqual({
      rotations: [1, 1, 1],
      wet: [0, 1, 2],
      leak: null,
      endSound: 'success',
    })
  })

  it('an unreadable tip shows the solution', () => {
    const rows = [row('them', null, null)]

    expect(shownBoard({ ...input, rows, selectedUserId: 'them' })?.rotations).toEqual([1, 1, 1])
  })

  it('without a solution an unreadable tip shows nothing', () => {
    const rows = [row('them', null, null)]

    expect(shownBoard({ ...input, rows, selectedUserId: 'them', solution: null })).toBeNull()
  })
})
