// The wooden knock, the games' shared voice on the app's graph: synthesised, so nothing to load.
// Whether sound is on is the caller's business (`useGameSound`).
import { audioGraph } from '@/ui/audio'

/** One sine: attack, then an exponential decay. */
interface Voice {
  peak: number
  attackS: number
  decayS: number
}

/**
 * A sine body and a short, quiet knock at 3.9× its pitch (a marimba's first overtone). Picked by
 * ear from candidates on a throwaway page.
 */
const BODY: Voice = { peak: 0.25, attackS: 0.004, decayS: 0.09 }
/** The last knock of a run rings out. */
const RING_DECAY_S = 0.3
const KNOCK: Voice = { peak: 0.05, attackS: 0.004, decayS: 0.02 }
const KNOCK_RATIO = 3.9

const STOP_FADE_S = 0.02
/** Exponential ramps cannot reach 0; this is inaudible, the line to 0 after it removes the rest. */
const QUIET = 0.0008

/** iOS mutes Web Audio under the ring/silent switch unless the session says „playback“. */
function claimPlayback(): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (session) session.type = 'playback'
}

/**
 * Wakes the graph. Call it synchronously inside a `click` or `pointerup`: iOS refuses a resume
 * anywhere else.
 */
export function unlockSound(): void {
  claimPlayback()
  const graph = audioGraph()
  if (graph?.state !== 'suspended') return

  graph.resume().catch((err: unknown) => {
    console.warn('[sound] the browser kept the audio graph suspended', err)
  })
}

/** One bus of knocks: `stop` fades the bus and ends every oscillator still to come. */
export function knocks(graph: AudioContext): {
  knock: (start: number, hz: number, ring?: boolean) => void
  counting: { stop(): void }
} {
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

    const oscillator = graph.createOscillator()
    oscillator.frequency.setValueAtTime(hz, start)
    oscillator.connect(level)
    oscillator.start(start)
    oscillator.stop(end + STOP_FADE_S)
    oscillators.push(oscillator)
  }

  return {
    knock(start, hz, ring = false) {
      voice(start, hz, ring ? { ...BODY, decayS: RING_DECAY_S } : BODY)
      voice(start, hz * KNOCK_RATIO, KNOCK)
    },
    counting: {
      stop() {
        const now = graph.currentTime
        bus.gain.setValueAtTime(bus.gain.value, now)
        bus.gain.linearRampToValueAtTime(0, now + STOP_FADE_S)
        for (const oscillator of oscillators) oscillator.stop(now + STOP_FADE_S)
      },
    },
  }
}
