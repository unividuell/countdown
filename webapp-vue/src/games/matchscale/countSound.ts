// Plays `countTones` on the app's graph: synthesised, so nothing to load. Without an `AudioContext`
// it stays silent. Whether sound is on is the caller's business (`useGameSound`).
import { audioGraph, START_LOOKAHEAD_SECONDS } from '@/ui/audio'
import type { Tone } from './countTones'

export interface Counting {
  stop(): void
}

/** Partials as `[ratio, level]` over one envelope: attack, then an exponential decay. */
interface Voice {
  partials: readonly (readonly [number, number])[]
  peak: number
  attackS: number
  decayS: number
  type?: OscillatorType
  /** The pitch slides to this ratio over the decay. */
  glide?: number
}

/** Near-pure sine with a quiet octave, click-short; the last one rings a little. */
const TICK: Voice = {
  partials: [
    [1, 1],
    [2, 0.16],
  ],
  peak: 0.22,
  attackS: 0.004,
  decayS: 0.03,
}
const LAST_TICK_DECAY_S = 0.12

/** After the last tick, the verdict. */
const FINALE_GAP_S = 0.07

/** C5 E5 G5 C6 E6, 40 ms apart; the last one rings out. */
const SUCCESS_HZ = [523.25, 659.25, 783.99, 1046.5, 1318.5]
const SUCCESS_STAGGER_S = 0.04
const SUCCESS: Voice = {
  partials: [
    [1, 1],
    [2, 0.2],
    [3, 0.05],
  ],
  peak: 0.2,
  attackS: 0.004,
  decayS: 0.12,
}
const SUCCESS_LAST_DECAY_S = 0.45

/** A low, slightly buzzing double tone that tips downwards. */
const FAIL_LOW: Voice = {
  partials: [
    [1, 1],
    [2, 0.45],
  ],
  type: 'triangle',
  peak: 0.35,
  attackS: 0.006,
  decayS: 0.16,
  glide: 0.88,
}
const FAIL_BUZZ: Voice = {
  partials: [[1, 1]],
  type: 'sawtooth',
  peak: 0.05,
  attackS: 0.004,
  decayS: 0.09,
  glide: 0.9,
}

const STOP_FADE_S = 0.02
/** Exponential ramps cannot reach 0; this is inaudible, the line to 0 after it removes the rest. */
const QUIET = 0.0008

const SILENT: Counting = { stop: () => {} }

/** iOS mutes Web Audio under the ring/silent switch unless the session says „playback“. */
function claimPlayback(): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (session) session.type = 'playback'
}

/**
 * Wakes the graph. Call it synchronously inside a `click` or `pointerup`: iOS refuses a resume
 * anywhere else, and the count plays from a timer.
 */
export function unlockSound(): void {
  claimPlayback()
  const graph = audioGraph()
  if (graph?.state !== 'suspended') return

  graph.resume().catch((err: unknown) => {
    console.warn('[match-scale] the browser kept the audio graph suspended', err)
  })
}

/**
 * Schedules every tone at once, on the graph's clock, then the verdict: `won` `null` plays none.
 * `stop` silences what has not sounded.
 */
export function playCount(tones: readonly Tone[], won: boolean | null): Counting {
  unlockSound()
  const graph = audioGraph()
  if (!graph || tones.length === 0) return SILENT

  const at = graph.currentTime + START_LOOKAHEAD_SECONDS
  const bus = graph.createGain()
  bus.connect(graph.destination)
  const oscillators: OscillatorNode[] = []

  const voice = (start: number, hz: number, v: Voice): void => {
    const end = start + v.attackS + v.decayS

    // 0 → peak → near silence → 0: no edge to click on.
    const level = graph.createGain()
    level.gain.setValueAtTime(0, start)
    level.gain.linearRampToValueAtTime(v.peak, start + v.attackS)
    level.gain.exponentialRampToValueAtTime(QUIET, end)
    level.gain.linearRampToValueAtTime(0, end + STOP_FADE_S)
    level.connect(bus)

    for (const [ratio, partialLevel] of v.partials) {
      const oscillator = graph.createOscillator()
      oscillator.type = v.type ?? 'sine'
      oscillator.frequency.setValueAtTime(hz * ratio, start)
      if (v.glide !== undefined) {
        oscillator.frequency.exponentialRampToValueAtTime(hz * ratio * v.glide, end)
      }

      const partial = graph.createGain()
      partial.gain.value = partialLevel
      oscillator.connect(partial).connect(level)
      oscillator.start(start)
      oscillator.stop(end + STOP_FADE_S)
      oscillators.push(oscillator)
    }
  }

  tones.forEach((tone, i) => {
    const last = i === tones.length - 1
    voice(at + tone.atS, tone.hz, last ? { ...TICK, decayS: LAST_TICK_DECAY_S } : TICK)
  })

  const finale = at + tones.at(-1)!.atS + FINALE_GAP_S
  if (won === true) {
    SUCCESS_HZ.forEach((hz, i) => {
      const last = i === SUCCESS_HZ.length - 1
      voice(
        finale + i * SUCCESS_STAGGER_S,
        hz,
        last ? { ...SUCCESS, decayS: SUCCESS_LAST_DECAY_S } : SUCCESS,
      )
    })
  }
  if (won === false) {
    voice(finale, 186, FAIL_LOW)
    voice(finale + 0.012, 444, FAIL_BUZZ)
  }

  return {
    stop() {
      const now = graph.currentTime
      bus.gain.setValueAtTime(bus.gain.value, now)
      bus.gain.linearRampToValueAtTime(0, now + STOP_FADE_S)
      for (const oscillator of oscillators) oscillator.stop(now + STOP_FADE_S)
    },
  }
}
