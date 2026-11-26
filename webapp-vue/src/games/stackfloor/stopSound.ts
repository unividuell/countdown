/**
 * A wooden knock per stop that cut something, low: confirmation, not a count. A perfect stop —
 * nothing cut off — rings two notes up instead, and each perfect stop in a row climbs the major
 * scale one step, up to an octave.
 */
import { START_LOOKAHEAD_SECONDS } from '@/ui/audio'
import { soundGraph } from '@/ui/soundOutput'
import { knocks } from '@/ui/woodKnock'

/** A4: an octave under the perfect notes, darker. */
export const STOP_HZ = 440

/** The sliding bar was stopped and lost a piece, or missed. */
export function playStop(): void {
  const graph = soundGraph()
  if (!graph) return

  knocks(graph).knock(graph.currentTime + START_LOOKAHEAD_SECONDS, STOP_HZ)
}

/** E6, and a fourth above it. */
const PERFECT_ROOT_HZ = 1318.51
const FOURTH = 2 ** (5 / 12)
const PERFECT_GAP_S = 0.07
/** Semitones of the major scale's steps, root to octave. */
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12] as const

/** The two notes of the [streak]th perfect stop in a row (1 = the first): E6 → A6, then up. */
export function perfectHz(streak: number): [number, number] {
  const step = Math.min(Math.max(streak, 1), MAJOR.length) - 1
  const root = PERFECT_ROOT_HZ * 2 ** (MAJOR[step]! / 12)

  return [root, root * FOURTH]
}

/** The bar was stopped on the one below; [streak] counts the perfect stops in a row. */
export function playPerfect(streak: number): void {
  const graph = soundGraph()
  if (!graph) return

  const at = graph.currentTime + START_LOOKAHEAD_SECONDS
  const bus = knocks(graph)
  perfectHz(streak).forEach((hz, i) => bus.knock(at + i * PERFECT_GAP_S, hz, true))
}
