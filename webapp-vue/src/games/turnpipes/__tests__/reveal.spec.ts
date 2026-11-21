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
  size: 3,
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
      puddles: [7],
      endSound: 'leak',
    })
  })

  it('another name shows that tip', () => {
    expect(shownBoard({ ...input, selectedUserId: 'them' })).toEqual({
      rotations: [2, 2, 2],
      wet: [0, 1, 2],
      puddles: [],
      endSound: 'success',
    })
  })

  it('nobody selected shows the solution, wet along its path', () => {
    expect(shownBoard(input)).toEqual({
      rotations: [1, 1, 1],
      wet: [0, 1, 2],
      puddles: [],
      endSound: 'success',
    })
  })

  it('water off the board puddles where it left', () => {
    const offBoard: TurnPipesOutcome = {
      correct: false,
      wet: [0, 1, 2],
      leak: { at: null, from: 2 },
    }
    const rows = [row('them', offBoard, [2, 2, 2])]

    expect(shownBoard({ ...input, rows, selectedUserId: 'them' })?.puddles).toEqual([2])
  })

  it('the outlet reached past dry pipes puddles every pipe the water missed', () => {
    const dry: TurnPipesOutcome = { correct: false, wet: [0, 1, 4, 5], leak: null }
    const rows = [row('them', dry, [2, 2, 2])]

    expect(shownBoard({ ...input, rows, selectedUserId: 'them' })).toMatchObject({
      puddles: [2, 3, 6, 7, 8],
      endSound: 'dry',
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
