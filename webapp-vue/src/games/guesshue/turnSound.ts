/**
 * The knob's ratchet: one wooden knock per degree, always the same pitch. A pitch that moved with
 * the angle would read as „the target is where it gets higher“.
 */
import { runningGraph, START_LOOKAHEAD_SECONDS } from '@/ui/audio'
import { knocks } from '@/ui/woodKnock'
import { wrap360 } from './geometry'

export const TURN_HZ = 700
/** Knocks closer than this pile up and clip: a quick turn drops the ones in between. */
const MIN_GAP_S = 0.03

/** The whole degree the knob stands in, 0 … 359. */
export function stepOf(hue: number): number {
  return Math.floor(wrap360(hue))
}

let lastAt = -Infinity

/** One knock. A sleeping graph stays silent: its knocks would all land on the wake-up. */
export function playTurn(): void {
  const graph = runningGraph()
  if (!graph) return

  const at = graph.currentTime + START_LOOKAHEAD_SECONDS
  if (at - lastAt < MIN_GAP_S) return
  lastAt = at

  knocks(graph).knock(at, TURN_HZ)
}

/**
 * Another player's marker lands on the wheel: the wheel's own knock, once, saying nothing about
 * how good the tip was. Not throttled — two markers are two knocks.
 */
export function playMarker(): void {
  const graph = runningGraph()
  if (!graph) return

  knocks(graph).knock(graph.currentTime + START_LOOKAHEAD_SECONDS, TURN_HZ)
}
