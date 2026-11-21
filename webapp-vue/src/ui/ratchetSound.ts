/**
 * A ratchet: one wooden knock per step, always the same pitch. Farbausmalung's knob turns it per
 * degree, Entstauber's curve per scrubbed level.
 */
import { START_LOOKAHEAD_SECONDS } from '@/ui/audio'
import { soundGraph } from './soundOutput'
import { knocks } from './woodKnock'

export const RATCHET_HZ = 700
/** Knocks closer than this pile up and clip: a quick turn drops the ones in between. */
const MIN_GAP_S = 0.03

let lastAt = -Infinity

/** One knock. A sleeping graph stays silent: its knocks would all land on the wake-up. */
export function playRatchet(): void {
  const graph = soundGraph()
  if (!graph) return

  const at = graph.currentTime + START_LOOKAHEAD_SECONDS
  if (at - lastAt < MIN_GAP_S) return
  lastAt = at

  knocks(graph).knock(at, RATCHET_HZ)
}
