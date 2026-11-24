/**
 * „Biiinnng“: a struck triangle, for a streak that grew. Synthesised like the knock, into
 * `soundOutput`. Inharmonic partials over C7 ring long; the two lowest
 * come as pairs a few Hz apart, so they beat like a real, slightly uneven bar. A noise tick
 * stands in for the beater.
 *
 *   partial  C7 ×1 ×1(+4 Hz)  ×2.76 ×2.76(−3 Hz)  ×5.4     higher = shorter ring
 *   beater   12 ms of noise above 5 kHz, fading quadratically
 */
import { START_LOOKAHEAD_SECONDS } from '@/ui/audio'
import { soundGraph, soundOutput } from './soundOutput'
import { QUIET, STOP_FADE_S } from './woodKnock'

const BASE_HZ = 2093
const ATTACK_S = 0.002

/** One sine of the bar: pitch as a ratio of the base plus a detune, its loudness and its ring. */
const PARTIALS = [
  { ratio: 1, detuneHz: 0, peak: 0.12, decayS: 3.0 },
  { ratio: 1, detuneHz: 4, peak: 0.07, decayS: 3.0 },
  { ratio: 2.76, detuneHz: 0, peak: 0.06, decayS: 1.8 },
  { ratio: 2.76, detuneHz: -3, peak: 0.035, decayS: 1.8 },
  { ratio: 5.4, detuneHz: 0, peak: 0.03, decayS: 1.0 },
]

const BEATER_S = 0.012
const BEATER_HZ = 5000
const BEATER_PEAK = 0.04

/** One strike. Muted or on a sleeping graph it stays silent. */
export function playTriangle(): void {
  const graph = soundGraph()
  if (!graph) return

  const at = graph.currentTime + START_LOOKAHEAD_SECONDS

  const bus = graph.createGain()
  bus.connect(soundOutput(graph))

  for (const { ratio, detuneHz, peak, decayS } of PARTIALS) {
    const end = at + ATTACK_S + decayS

    // 0 → peak → near silence → 0: no edge to click on.
    const level = graph.createGain()
    level.gain.setValueAtTime(0, at)
    level.gain.linearRampToValueAtTime(peak, at + ATTACK_S)
    level.gain.exponentialRampToValueAtTime(QUIET, end)
    level.gain.linearRampToValueAtTime(0, end + STOP_FADE_S)
    level.connect(bus)

    const oscillator = graph.createOscillator()
    oscillator.frequency.setValueAtTime(BASE_HZ * ratio + detuneHz, at)
    oscillator.connect(level)
    oscillator.start(at)
    oscillator.stop(end + STOP_FADE_S)
  }

  // Noise whose amplitude falls off quadratically: a sharp tick, not a hiss.
  const length = Math.ceil(graph.sampleRate * BEATER_S)
  const buffer = graph.createBuffer(1, length, graph.sampleRate)
  const samples = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    samples[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2
  }

  const noise = graph.createBufferSource()
  noise.buffer = buffer

  const highpass = graph.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = BEATER_HZ

  const tick = graph.createGain()
  tick.gain.value = BEATER_PEAK

  noise.connect(highpass).connect(tick).connect(bus)
  noise.start(at)
  noise.stop(at + BEATER_S)
}
