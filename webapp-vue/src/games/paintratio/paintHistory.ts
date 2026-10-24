import { usageOf } from './strokes'
import { MAX_PATH, MAX_POINTS, MAX_STROKES, pathOf } from './types'
import type { Stroke } from './types'

/** The painting so far, and the strokes undone since the last one was added. */
export interface PaintState {
  strokes: Stroke[]
  redo: Stroke[]
}

export const EMPTY_PAINT: PaintState = { strokes: [], redo: [] }

/** A new stroke ends the chance to redo: what was undone is gone for good. */
export function addStroke(state: PaintState, stroke: Stroke): PaintState {
  return { strokes: [...state.strokes, stroke], redo: [] }
}

export function undo(state: PaintState): PaintState {
  const last = state.strokes.at(-1)
  if (last === undefined) return state

  return { strokes: state.strokes.slice(0, -1), redo: [...state.redo, last] }
}

export function redo(state: PaintState): PaintState {
  const next = state.redo.at(-1)
  if (next === undefined) return state

  return { strokes: [...state.strokes, next], redo: state.redo.slice(0, -1) }
}

/**
 * Whether redo has a stroke to bring back that the server would still take beside the painting. A
 * loaded draft keeps each list within the limits, not necessarily both together.
 */
export function canRedo(state: PaintState): boolean {
  const next = state.redo.at(-1)
  if (next === undefined || state.strokes.length >= MAX_STROKES) return false

  const usage = usageOf(state.strokes)

  return (
    usage.points + next.points.length / 2 <= MAX_POINTS &&
    usage.path + pathOf(next.points) <= MAX_PATH
  )
}

/** The template shows until the first stroke, and again once every stroke is undone. */
export function showsTemplate(state: PaintState): boolean {
  return state.strokes.length === 0
}
