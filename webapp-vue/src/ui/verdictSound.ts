// The reveal's verdict on my tip, in wooden knocks: a rising arpeggio for a win, two falling
// knocks for a loss.
import { START_LOOKAHEAD_SECONDS } from '@/ui/audio'
import { soundGraph } from './soundOutput'
import { knocks } from './woodKnock'

/** A win: C5 E5 G5 C6 E6, 40 ms apart. */
const SUCCESS_HZ = [523.25, 659.25, 783.99, 1046.5, 1318.5]
const SUCCESS_STAGGER_S = 0.04

/** A loss: two knocks falling, „wah-wah“. */
const FAIL_HZ = [311, 220]
const FAIL_STAGGER_S = 0.15

export interface Verdict {
  stop(): void
}

const SILENT: Verdict = { stop: () => {} }

/** The verdict from `at` on, on a knock bus. */
function scheduleVerdict(
  knock: (start: number, hz: number, ring?: boolean) => void,
  at: number,
  won: boolean,
): void {
  const pitches = won ? SUCCESS_HZ : FAIL_HZ
  const staggerS = won ? SUCCESS_STAGGER_S : FAIL_STAGGER_S

  pitches.forEach((hz, i) => knock(at + i * staggerS, hz, i === pitches.length - 1))
}

/**
 * The verdict alone. Muted or on a sleeping graph it stays silent: a verdict that sounds with the
 * next tap says nothing about the tip any more.
 */
export function playVerdict(won: boolean): Verdict {
  const graph = soundGraph()
  if (!graph) return SILENT

  const { knock, counting } = knocks(graph)
  scheduleVerdict(knock, graph.currentTime + START_LOOKAHEAD_SECONDS, won)

  return counting
}
