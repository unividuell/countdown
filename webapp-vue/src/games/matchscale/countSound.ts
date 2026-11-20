// Plays `countTones` on the app's graph: synthesised, so nothing to load. Without an `AudioContext`
// it stays silent. Whether sound is on is the caller's business (`useGameSound`).
import { audioGraph, START_LOOKAHEAD_SECONDS } from '@/ui/audio'
import type { Tone } from './countTones'

export interface Counting {
  stop(): void
}

/** A triangle's peak: its RMS (≈ 0.09) sits by Peilung's `REF_RMS`, at the clips' loudness. */
const PEAK_GAIN = 0.15
/** Short enough not to click, long enough to be no sound of its own. */
const ATTACK_S = 0.004
const DECAY_S = 0.09
/** The arrival rings a little longer. */
const LAST_DECAY_S = 0.3
const STOP_FADE_S = 0.02
/** Exponential ramps cannot reach 0; this is inaudible, the line to 0 after it removes the rest. */
const QUIET = 0.001

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

/** Schedules every tone at once, on the graph's clock; `stop` silences what has not sounded. */
export function playCount(tones: readonly Tone[]): Counting {
  unlockSound()
  const graph = audioGraph()
  if (!graph || tones.length === 0) return SILENT

  const at = graph.currentTime + START_LOOKAHEAD_SECONDS
  const bus = graph.createGain()
  bus.connect(graph.destination)

  const oscillators = tones.map((tone, i) => {
    const start = at + tone.atS
    const decay = i === tones.length - 1 ? LAST_DECAY_S : DECAY_S
    const end = start + ATTACK_S + decay

    const oscillator = graph.createOscillator()
    oscillator.type = 'triangle'
    oscillator.frequency.value = tone.hz

    // 0 → peak → near silence → 0: no edge to click on.
    const level = graph.createGain()
    level.gain.setValueAtTime(0, start)
    level.gain.linearRampToValueAtTime(PEAK_GAIN, start + ATTACK_S)
    level.gain.exponentialRampToValueAtTime(QUIET, end)
    level.gain.linearRampToValueAtTime(0, end + STOP_FADE_S)

    oscillator.connect(level).connect(bus)
    oscillator.start(start)
    oscillator.stop(end + STOP_FADE_S)

    return oscillator
  })

  return {
    stop() {
      const now = graph.currentTime
      bus.gain.setValueAtTime(bus.gain.value, now)
      bus.gain.linearRampToValueAtTime(0, now + STOP_FADE_S)
      for (const oscillator of oscillators) oscillator.stop(now + STOP_FADE_S)
    },
  }
}
