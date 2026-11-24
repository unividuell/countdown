/**
 * „Plop“: a drop landing in liquid. The bubble it traps rings as a sine whose pitch rises fast
 * while it fades, the same for every pigment.
 *
 *   pitch  500 Hz ─exp→ 1400 Hz in 50 ms
 *   level  0 → peak in 2 ms, then down to silence in 90 ms
 */
import { START_LOOKAHEAD_SECONDS } from '@/ui/audio'
import { soundGraph, soundOutput } from '@/ui/soundOutput'
import { QUIET, STOP_FADE_S } from '@/ui/woodKnock'

export const DROP_FROM_HZ = 500
export const DROP_TO_HZ = 1400

const SWEEP_S = 0.05
const ATTACK_S = 0.002
const DECAY_S = 0.09
const PEAK = 0.25

/** One drop. Muted or on a sleeping graph it stays silent. */
export function playDrop(): void {
  const graph = soundGraph()
  if (!graph) return

  const at = graph.currentTime + START_LOOKAHEAD_SECONDS
  const end = at + ATTACK_S + DECAY_S

  const level = graph.createGain()
  level.gain.setValueAtTime(0, at)
  level.gain.linearRampToValueAtTime(PEAK, at + ATTACK_S)
  level.gain.exponentialRampToValueAtTime(QUIET, end)
  level.gain.linearRampToValueAtTime(0, end + STOP_FADE_S)
  level.connect(soundOutput(graph))

  const oscillator = graph.createOscillator()
  oscillator.frequency.setValueAtTime(DROP_FROM_HZ, at)
  oscillator.frequency.exponentialRampToValueAtTime(DROP_TO_HZ, at + SWEEP_S)
  oscillator.connect(level)
  oscillator.start(at)
  oscillator.stop(end + STOP_FADE_S)
}
