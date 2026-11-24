/**
 * The last node before the speakers: everything the app plays passes it, so the volume is set in
 * one place.
 *
 *   soundOutput (decoration) ─┐
 *   usePlayback (clips)  ─────┼─▶ master (gain: volume²) ─▶ destination
 *   EchoEngine (Peilung) ─────┘
 */
import { effectScope, watch } from 'vue'
import { useGameVolume, volumeGain } from './useGameVolume'

/** Long enough not to click, short enough to follow a dragged slider. */
const RAMP_S = 0.02

/** Detached: the volume must outlive whichever component asked first. */
const scope = effectScope(true)

let master: { graph: AudioContext; node: GainNode } | null = null

/** Connect here instead of `graph.destination`. */
export function masterOutput(graph: AudioContext): AudioNode {
  if (master?.graph === graph) return master.node

  const volume = scope.run(() => useGameVolume())!
  const node = graph.createGain()
  node.gain.value = volumeGain(volume.value)
  node.connect(graph.destination)
  master = { graph, node }

  scope.run(() =>
    watch(volume, (v) => {
      const now = graph.currentTime
      node.gain.setValueAtTime(node.gain.value, now)
      node.gain.linearRampToValueAtTime(volumeGain(v), now + RAMP_S)
    }),
  )

  return node
}
