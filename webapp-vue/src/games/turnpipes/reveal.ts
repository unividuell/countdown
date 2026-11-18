/**
 * What the reveal's grid shows for the selected name. Pure, like Blockierung's `reveal.ts`.
 */
import type { ScoreRow } from './scoreboard'
import { endSoundOf } from './sounds'
import type { Leak, TurnPipesOutcome, TurnPipesSolution } from './types'

export interface ShownBoard {
  rotations: number[]
  wet: number[]
  leak: Leak | null
  endSound: 'leak' | 'success' | 'dry'
}

function ofTip(rotations: number[], outcome: TurnPipesOutcome): ShownBoard {
  return {
    rotations,
    wet: outcome.wet,
    leak: outcome.leak,
    endSound: endSoundOf(outcome),
  }
}

/**
 * The tip of the selected name; the solution when nobody is selected or the tip cannot be read —
 * its pipes all wet, along its path. `null` when there is nothing to show.
 */
export function shownBoard(input: {
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

    if (rotations && outcome) return ofTip(rotations, outcome)
  }

  if (!input.solution) return null

  return {
    rotations: input.solution.rotations,
    wet: input.solution.path,
    leak: null,
    endSound: 'success',
  }
}
