/**
 * A wooden knock per stop, one pitch for all: confirmation, not a count. A perfect stop — nothing
 * cut off — rings two notes up instead.
 */
import { START_LOOKAHEAD_SECONDS } from '@/ui/audio'
import { soundGraph } from '@/ui/soundOutput'
import { knocks } from '@/ui/woodKnock'

/** A5. */
export const STOP_HZ = 880

/** The sliding bar was stopped. */
export function playStop(): void {
  const graph = soundGraph()
  if (!graph) return

  knocks(graph).knock(graph.currentTime + START_LOOKAHEAD_SECONDS, STOP_HZ)
}

/** E6 then A6, a fourth up, ringing. */
export const PERFECT_HZ = [1318.51, 1760] as const
const PERFECT_GAP_S = 0.07

/** The bar was stopped exactly on the one below. */
export function playPerfect(): void {
  const graph = soundGraph()
  if (!graph) return

  const at = graph.currentTime + START_LOOKAHEAD_SECONDS
  const bus = knocks(graph)
  PERFECT_HZ.forEach((hz, i) => bus.knock(at + i * PERFECT_GAP_S, hz, true))
}
