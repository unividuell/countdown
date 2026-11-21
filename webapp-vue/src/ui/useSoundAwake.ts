import { useEventListener } from '@vueuse/core'
import { ref, type Ref } from 'vue'
import { audioGraph, unlockSound } from './audio'
import { useGameSound } from './useGameSound'

/**
 * Whether the app's graph is running. A browser lets it start only after a user activation, and a
 * finger setting down is none: after a fresh load the first drag is silent, whatever the setting.
 *
 *   load ──▶ asleep ──(tap, release or key anywhere)──▶ awake
 *
 * While sound is on, every activation on the page asks the graph to wake. Without Web Audio there
 * is nothing to wait for: awake.
 */
export function useSoundAwake(): Readonly<Ref<boolean>> {
  const sound = useGameSound()
  const graph = audioGraph()
  const awake = ref(graph === null || graph.state === 'running')
  if (graph === null) return awake

  useEventListener(graph, 'statechange', () => {
    awake.value = graph.state === 'running'
  })

  const wake = (event: Event): void => {
    // A touch `pointerdown` is no activation: the resume would be refused.
    if (event.type === 'pointerdown' && (event as PointerEvent).pointerType !== 'mouse') return
    if (sound.value && !awake.value) unlockSound()
  }
  // Captured: a game that stops its pointer events must not keep the graph asleep.
  useEventListener(document, ['pointerdown', 'pointerup', 'keydown'], wake, { capture: true })

  return awake
}
