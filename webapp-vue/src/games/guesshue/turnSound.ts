/**
 * The knob's ratchet: one wooden knock per degree, always the same pitch. A pitch that moved with
 * the angle would read as „the target is where it gets higher“.
 */
import { RATCHET_HZ, playRatchet } from '@/ui/ratchetSound'
import { wrap360 } from './geometry'

export const TURN_HZ = RATCHET_HZ

/** The whole degree the knob stands in, 0 … 359. */
export function stepOf(hue: number): number {
  return Math.floor(wrap360(hue))
}

/** One knock. A sleeping graph stays silent: its knocks would all land on the wake-up. */
export const playTurn = playRatchet
