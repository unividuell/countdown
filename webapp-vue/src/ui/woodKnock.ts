// The wooden knock, the games' shared voice on the app's graph: synthesised, so nothing to load.
// It plays into `soundOutput`, which is where the sound switch is honoured.
import { soundOutput } from './soundOutput'

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

/**
 * Every knock of every game passes this. Sound is a side note, not a signal: quieter here, never
 * louder in a game.
 */
export const VOLUME = 0.35

export const STOP_FADE_S = 0.02
/** Exponential ramps cannot reach 0; this is inaudible, the line to 0 after it removes the rest. */
export const QUIET = 0.0008

/** One bus of knocks: `stop` fades the bus and ends every oscillator still to come. */
export function knocks(graph: AudioContext): {
  knock: (start: number, hz: number, ring?: boolean) => void
  counting: { stop(): void }
} {
  const bus = graph.createGain()
  bus.gain.value = VOLUME
  bus.connect(soundOutput(graph))
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
