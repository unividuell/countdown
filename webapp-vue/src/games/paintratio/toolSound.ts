/**
 * Picking a brush, heard: the thicker, the lower — a chord down from G5.
 *
 *   brush   klein   mittel   groß
 *   pitch   G5      E5       C5
 *
 * Undo knocks below, redo above: back and forth, by ear.
 */
import { START_LOOKAHEAD_SECONDS } from '@/ui/audio'
import { scaleHz } from '@/ui/scale'
import { soundGraph } from '@/ui/soundOutput'
import { knocks } from '@/ui/woodKnock'

/** Steps of the scale from C5, thinnest brush first. */
const BRUSH_STEPS = [4, 2, 0]

/** The pitch of brush `index`, 0 the thinnest. */
export function brushHz(index: number): number {
  return scaleHz(BRUSH_STEPS[index] ?? 0)
}

/** D5 and A5: outside the brushes' chord, a fifth apart. */
export const UNDO_HZ = scaleHz(1)
export const REDO_HZ = scaleHz(5)

function knockAt(hz: number): void {
  const graph = soundGraph()
  if (!graph) return

  knocks(graph).knock(graph.currentTime + START_LOOKAHEAD_SECONDS, hz)
}

/** One knock for the brush just picked. */
export function playBrush(index: number): void {
  knockAt(brushHz(index))
}

export function playUndo(): void {
  knockAt(UNDO_HZ)
}

export function playRedo(): void {
  knockAt(REDO_HZ)
}
