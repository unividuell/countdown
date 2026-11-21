/**
 * „Wruusch“: a broom's sweep, for tidying up. White noise through a band-pass gliding down, swelling
 * in and fading out — air, not wood, so it reads as clearing rather than as a tap. Synthesised like
 * the knock, into `soundOutput`, at the shared `VOLUME`.
 *
 *   band    2.4 kHz ─────╲──────── 500 Hz      over SWEEP_S
 *   level   0 ╱‾‾‾‾‾‾‾‾‾‾‾╲___ 0                ATTACK_S in, then out
 */
import { START_LOOKAHEAD_SECONDS } from '@/ui/audio'
import { soundGraph, soundOutput } from './soundOutput'
import { VOLUME } from './woodKnock'

const SWEEP_S = 0.32
const ATTACK_S = 0.06
const FROM_HZ = 2400
const TO_HZ = 500
/** Wide enough to hiss, narrow enough that the glide is heard. */
const Q = 1.4
/** Noise through a narrow band is far quieter than a knock's sine; this brings it level by ear. */
const PEAK = 1.6
const QUIET = 0.0008

/** One sweep. Muted or on a sleeping graph it stays silent. */
export function playWhoosh(): void {
  const graph = soundGraph()
  if (!graph) return

  const at = graph.currentTime + START_LOOKAHEAD_SECONDS
  const end = at + SWEEP_S

  const length = Math.ceil(graph.sampleRate * SWEEP_S)
  const buffer = graph.createBuffer(1, length, graph.sampleRate)
  const samples = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1

  const noise = graph.createBufferSource()
  noise.buffer = buffer

  const band = graph.createBiquadFilter()
  band.type = 'bandpass'
  band.Q.value = Q
  band.frequency.setValueAtTime(FROM_HZ, at)
  band.frequency.exponentialRampToValueAtTime(TO_HZ, end)

  const level = graph.createGain()
  level.gain.setValueAtTime(0, at)
  level.gain.linearRampToValueAtTime(PEAK * VOLUME, at + ATTACK_S)
  level.gain.exponentialRampToValueAtTime(QUIET, end)

  noise.connect(band).connect(level).connect(soundOutput(graph))
  noise.start(at)
  noise.stop(end)
}
