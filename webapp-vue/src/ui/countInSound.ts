// A cover's count-in, heard: 3, 2, 1 on the beat, GO with the full ring — Musterung's marking run.
//
//   face    3    2    1    GO
//   pitch   C5   D5   E5   F5 (rings out)
import { START_LOOKAHEAD_SECONDS } from '@/ui/audio'
import type { Charging } from './chargeSound'
import { scaleHz } from './scale'
import { soundGraph } from './soundOutput'
import { knocks } from './woodKnock'

const SILENT: Charging = { stop: () => {} }

/**
 * Every knock of a count-in of `beats` × `beatMs`, scheduled with the press; `stop` silences what
 * has not sounded — a released hold. A sleeping graph stays silent.
 */
export function playCountIn(beats: number, beatMs: number): Charging {
  const graph = soundGraph()
  if (!graph) return SILENT

  const at = graph.currentTime + START_LOOKAHEAD_SECONDS
  const { knock, counting } = knocks(graph)
  for (let beat = 0; beat <= beats; beat++)
    knock(at + (beat * beatMs) / 1000, scaleHz(beat), beat === beats)

  return counting
}
