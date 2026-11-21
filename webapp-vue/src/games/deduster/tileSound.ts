/**
 * A wooden knock per hit tile, one pitch for all: confirmation, not a count. The run's end is the
 * shared verdict — the last tile wins, a wrong tile or a missed beat fails.
 */
import { START_LOOKAHEAD_SECONDS } from '@/ui/audio'
import { soundGraph } from '@/ui/soundOutput'
import { knocks } from '@/ui/woodKnock'

/** G5: inside the verdict's C major, between its first knocks. */
export const HIT_HZ = 783.99

/** The tile under the finger was the hot one. */
export function playHit(): void {
  const graph = soundGraph()
  if (!graph) return

  knocks(graph).knock(graph.currentTime + START_LOOKAHEAD_SECONDS, HIT_HZ)
}
