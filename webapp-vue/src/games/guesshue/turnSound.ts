/**
 * The knob's ratchet: one wooden knock per degree, always the same pitch. A pitch that moved with
 * the angle would read as „the target is where it gets higher“.
 */
import { START_LOOKAHEAD_SECONDS } from '@/ui/audio'
import { RATCHET_HZ, playRatchet } from '@/ui/ratchetSound'
import { soundGraph } from '@/ui/soundOutput'
import { knocks } from '@/ui/woodKnock'
import { wrap360 } from './geometry'

export const TURN_HZ = RATCHET_HZ

/** The whole degree the knob stands in, 0 … 359. */
export function stepOf(hue: number): number {
  return Math.floor(wrap360(hue))
}

/** One knock. A sleeping graph stays silent: its knocks would all land on the wake-up. */
export const playTurn = playRatchet

/**
 * Another player's marker lands on the wheel: the wheel's own knock, once, saying nothing about
 * how good the tip was. Not throttled — two markers are two knocks.
 */
export function playMarker(): void {
  const graph = soundGraph()
  if (!graph) return

  knocks(graph).knock(graph.currentTime + START_LOOKAHEAD_SECONDS, TURN_HZ)
}
