// Augenmaß's sounds on the app's graph — the board's opening, the reveal's count and verdict:
// synthesised, so nothing to load. Without an `AudioContext` it stays silent. Whether sound is on is the caller's business (`useGameSound`).
import { audioGraph, START_LOOKAHEAD_SECONDS } from '@/ui/audio'
import { knocks, unlockSound } from '@/ui/woodKnock'
import type { Tone } from './countTones'

export interface Counting {
  stop(): void
}

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

const SILENT: Counting = { stop: () => {} }

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
