/**
 * What the reveal's grid shows for the selected name. Pure, like Blockierung's `reveal.ts`.
 */
import type { ScoreRow } from './scoreboard'
import { endSoundOf } from './sounds'
import type { TurnPipesOutcome, TurnPipesSolution } from './types'

export interface ShownBoard {
  rotations: number[]
  wet: number[]
  /** Cells under dirty water once the run ends: the burst, or every pipe the water missed. */
  puddles: number[]
  endSound: 'leak' | 'success' | 'dry'
}

/** A burst puddles where the water stopped (or left the board); a miss puddles every dry pipe. */
function puddlesOf(outcome: TurnPipesOutcome, size: number): number[] {
  if (outcome.leak) return [outcome.leak.at ?? outcome.leak.from]
  if (outcome.correct) return []

  const wet = new Set(outcome.wet)
  return Array.from({ length: size * size }, (_, cell) => cell).filter((cell) => !wet.has(cell))
}

function ofTip(rotations: number[], outcome: TurnPipesOutcome, size: number): ShownBoard {
  return {
    rotations,
    wet: outcome.wet,
    puddles: puddlesOf(outcome, size),
    endSound: endSoundOf(outcome),
  }
}

/**
 * The tip of the selected name; the solution when nobody is selected or the tip cannot be read —
 * its pipes all wet, along its path. `null` when there is nothing to show.
 */
export function shownBoard(input: {
  size: number
  selectedUserId: string | null
  mineUserId: string | null
  myRotations: number[] | null
  myOutcome: TurnPipesOutcome | null
  rows: readonly ScoreRow[]
  solution: TurnPipesSolution | null
}): ShownBoard | null {
  const id = input.selectedUserId

  if (id !== null) {
    const mine = id === input.mineUserId
    const row = input.rows.find((r) => r.userId === id)
    const rotations = mine ? input.myRotations : (row?.rotations ?? null)
    const outcome = mine ? input.myOutcome : (row?.outcome ?? null)

    if (rotations && outcome) return ofTip(rotations, outcome, input.size)
  }

  if (!input.solution) return null

  return {
    rotations: input.solution.rotations,
    wet: input.solution.path,
    puddles: [],
    endSound: 'success',
  }
}
