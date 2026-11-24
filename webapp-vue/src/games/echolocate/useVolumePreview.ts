import { onBeforeUnmount } from 'vue'
import { runningGraph } from '@/ui/audio'
import { EchoEngine, bufferOf } from './engine'
import { bedSamples } from './noise'

/** How long the probe sounds on after the slider last moved. */
export const PROBE_MS = 400

/**
 * Lets a dragged volume slider be heard: Peilung's bed at gain 1 — the level the sayings come at,
 * not the round's quieter bed — through its own engine, so mix and limiter match the game.
 *
 *   adjust ─▶ bed (gain 1) ─▶ engine mix ─▶ limiter ─▶ master ─▶ speakers
 *          └─ PROBE_MS after the last one: stop
 */
export function useVolumePreview(): { onAdjust: () => void } {
  let engine: EchoEngine | null = null
  let bed: AudioBuffer | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  function onAdjust(): void {
    const graph = runningGraph()
    if (graph === null) return

    engine ??= new EchoEngine(graph)
    bed ??= bufferOf(graph, bedSamples(graph.sampleRate), graph.sampleRate)
    engine.startBed(bed, 1)

    clearTimeout(timer)
    timer = setTimeout(() => engine?.stopBed(), PROBE_MS)
  }

  onBeforeUnmount(() => {
    clearTimeout(timer)
    engine?.dispose()
    engine = null
  })

  return { onAdjust }
}
