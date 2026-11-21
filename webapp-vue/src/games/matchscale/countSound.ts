// Augenmaß's sounds on the app's graph — the board's opening, the reveal's count and verdict:
// synthesised, so nothing to load. Without an `AudioContext` it stays silent. Whether sound is on is the caller's business (`useGameSound`).
import { audioGraph, START_LOOKAHEAD_SECONDS } from '@/ui/audio'
import type { Tone } from './countTones'

export interface Counting {
  stop(): void
}

/** One sine: attack, then an exponential decay. */
interface Voice {
  peak: number
  attackS: number
  decayS: number
}

/**
 * Every sound of the game is one wooden knock: a sine body and a short, quiet knock at 3.9× its
 * pitch (a marimba's first overtone). Picked by ear from candidates on a throwaway page.
 */
const BODY: Voice = { peak: 0.25, attackS: 0.004, decayS: 0.09 }
/** The last knock of a run rings out. */
const RING_DECAY_S = 0.3
const KNOCK: Voice = { peak: 0.05, attackS: 0.004, decayS: 0.02 }
const KNOCK_RATIO = 3.9

/** After the last tick, the verdict. */
const FINALE_GAP_S = 0.07

/** A win: C5 E5 G5 C6 E6, 40 ms apart. */
const SUCCESS_HZ = [523.25, 659.25, 783.99, 1046.5, 1318.5]
const SUCCESS_STAGGER_S = 0.04

/** A loss: two knocks falling, „wah-wah“. */
const FAIL_HZ = [311, 220] as const
const FAIL_STAGGER_S = 0.15

/** The board's opening: A knocks, B a fourth higher once it pops in. */
export const POP_GAP_MS = 220
export const POP_MS = 260
const POP_HZ = 700
const FOURTH = 2 ** (5 / 12)
/** A graph that wakes later than this would knock after the shapes stood: silence instead. */
const POP_WAKE_LIMIT_MS = 150

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

/** One bus of knocks: `stop` fades the bus and ends every oscillator still to come. */
function knocks(graph: AudioContext): {
  knock: (start: number, hz: number, ring?: boolean) => void
  counting: Counting
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

/**
 * Schedules every tone at once, on the graph's clock, then the verdict: `won` `null` plays none.
 * `stop` silences what has not sounded.
 */
export function playCount(tones: readonly Tone[], won: boolean | null): Counting {
  unlockSound()
  const graph = audioGraph()
  if (!graph || tones.length === 0) return SILENT

  const at = graph.currentTime + START_LOOKAHEAD_SECONDS
  const { knock, counting } = knocks(graph)

  tones.forEach((tone, i) => knock(at + tone.atS, tone.hz, i === tones.length - 1))

  const finale = at + tones.at(-1)!.atS + FINALE_GAP_S
  if (won === true) {
    SUCCESS_HZ.forEach((hz, i) =>
      knock(finale + i * SUCCESS_STAGGER_S, hz, i === SUCCESS_HZ.length - 1),
    )
  }
  if (won === false) {
    FAIL_HZ.forEach((hz, i) => knock(finale + i * FAIL_STAGGER_S, hz, i === FAIL_HZ.length - 1))
  }

  return counting
}

/**
 * The board's opening, in step with its pop-in: A knocks, B a fourth higher `POP_GAP_MS` later.
 * A graph still asleep (no tap on the page yet) gets `POP_WAKE_LIMIT_MS` to wake, else it stays
 * silent — the knocks would come after the shapes, or with the first tap.
 */
export function playPop(): Counting {
  unlockSound()
  const graph = audioGraph()
  if (!graph) return SILENT

  let stopped = false
  let counting: Counting = SILENT
  const schedule = (): void => {
    const at = graph.currentTime + START_LOOKAHEAD_SECONDS
    const bus = knocks(graph)
    bus.knock(at, POP_HZ)
    bus.knock(at + POP_GAP_MS / 1000, POP_HZ * FOURTH)
    counting = bus.counting
  }

  if (graph.state === 'running') schedule()
  else {
    const asked = performance.now()
    graph
      .resume()
      .then(() => {
        if (!stopped && performance.now() - asked <= POP_WAKE_LIMIT_MS) schedule()
      })
      .catch(() => {})
  }

  return {
    stop() {
      stopped = true
      counting.stop()
    },
  }
}
