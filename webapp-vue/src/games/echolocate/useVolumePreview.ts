import { onBeforeUnmount } from 'vue'
import { runningGraph } from '@/ui/audio'
import { useGameVolume } from '@/ui/useGameVolume'
import { EchoEngine, bufferOf } from './engine'
import { bedSamples } from './noise'

/** How long a keyboard step sounds on: a key has no release to wait for. */
export const PROBE_MS = 400

/**
 * Lets the volume be heard while it is set: Peilung's bed at gain 1 — the level the sayings come
 * at, not the round's quieter bed — through its own engine, so mix and limiter match the game.
 *
 *   press ──▶ bed (gain 1) ─▶ engine mix ─▶ limiter ─▶ master ─▶ speakers
 *   release ─▶ stop
 *   adjust without a press (keyboard) ─▶ bed, stop PROBE_MS after the last step
 */
export function useVolumePreview(): {
  onPress: () => void
  onAdjust: () => void
  onRelease: () => void
} {
  let engine: EchoEngine | null = null
  let bed: AudioBuffer | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let pressed = false
  const volume = useGameVolume()

  function play(): void {
    clearTimeout(timer)

    // Muted asks for no graph: building one claims the device's audio session.
    if (volume.value === 0) return

    const graph = runningGraph()
    if (graph === null) return

    engine ??= new EchoEngine(graph)
    bed ??= bufferOf(graph, bedSamples(graph.sampleRate), graph.sampleRate)
    engine.startBed(bed, 1)
  }

  function onPress(): void {
    pressed = true
    play()
  }

  // A drag from zero starts the bed on its first audible step.
  function onAdjust(): void {
    play()
    if (!pressed) timer = setTimeout(() => engine?.stopBed(), PROBE_MS)
  }

  function onRelease(): void {
    pressed = false
    clearTimeout(timer)
    engine?.stopBed()
  }

  onBeforeUnmount(() => {
    clearTimeout(timer)
    engine?.dispose()
    engine = null
  })

  return { onPress, onAdjust, onRelease }
}
