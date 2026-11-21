// The charge of a `HoldButton`, heard: wooden knocks up a scale, on the beat of the ring
// (`charge.ts`).
import { START_LOOKAHEAD_SECONDS } from '@/ui/audio'
import { chargeKnocks } from './charge'
import { soundGraph } from './soundOutput'
import { knocks } from './woodKnock'

export interface Charging {
  stop(): void
}

const SILENT: Charging = { stop: () => {} }

/**
 * Schedules every knock still ahead of a hold that stands at `from` (0 … 1 of its time) and lasts
 * `holdMs`, all at once on the graph's clock; the last one rings. `stop` silences what has not
 * sounded — a released hold. A sleeping graph stays silent: its knocks would all land on the
 * wake-up.
 */
export function playCharge(from: number, holdMs: number): Charging {
  const graph = soundGraph()
  if (!graph) return SILENT

  const at = graph.currentTime + START_LOOKAHEAD_SECONDS
  const { knock, counting } = knocks(graph)
  const ahead = chargeKnocks().filter(({ time }) => time >= from)

  ahead.forEach(({ time, hz }, i) =>
    knock(at + ((time - from) * holdMs) / 1000, hz, i === ahead.length - 1),
  )

  return counting
}
