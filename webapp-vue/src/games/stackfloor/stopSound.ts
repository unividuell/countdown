/** A wooden knock per stop, one pitch for all: confirmation, not a count. */
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
