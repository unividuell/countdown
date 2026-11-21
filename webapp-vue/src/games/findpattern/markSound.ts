/**
 * A wooden knock per marked block, one step up the scale for each: the run fills up by ear. The
 * pitch follows how many blocks I marked, never the board, so it hints at nothing.
 *
 *   marked   1    2    3    4 (complete: rings out)
 *   pitch    C5   D5   E5   F5
 *
 * Tapping a marked block drops the whole selection: „ba-dum“, two knocks down.
 */
import { START_LOOKAHEAD_SECONDS } from '@/ui/audio'
import { soundGraph } from '@/ui/soundOutput'
import { knocks } from '@/ui/woodKnock'

const C5_HZ = 523.25
/** Semitones above C of the major scale's steps. */
const MAJOR = [0, 2, 4, 5, 7, 9, 11]

/** The pitch of the `count`-th marked block, from 1: C5, D5, E5, … on into the next octave. */
export function markHz(count: number): number {
  const step = Math.max(0, count - 1)
  const semitones = 12 * Math.floor(step / MAJOR.length) + MAJOR[step % MAJOR.length]!

  return C5_HZ * 2 ** (semitones / 12)
}

/** One knock for a selection now `count` blocks long; the completing one rings out. */
export function playMark(count: number, complete: boolean): void {
  const graph = soundGraph()
  if (!graph) return

  knocks(graph).knock(graph.currentTime + START_LOOKAHEAD_SECONDS, markHz(count), complete)
}

/** „Ba-dum“: a fourth down, quick. Higher and shorter than the verdict's fail, which it is not. */
export const CLEAR_HZ = [587.33, 440] as const
const CLEAR_STAGGER_S = 0.1

/** The selection is gone. */
export function playClear(): void {
  const graph = soundGraph()
  if (!graph) return

  const at = graph.currentTime + START_LOOKAHEAD_SECONDS
  const { knock } = knocks(graph)
  CLEAR_HZ.forEach((hz, i) => knock(at + i * CLEAR_STAGGER_S, hz))
}
