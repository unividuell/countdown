import { useEventListener } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { audioGraph, unlockSound } from './audio'
import { useGameSound } from './useGameSound'

/** Boards on screen whose knocks the switch governs. */
const stages = ref(0)

/**
 * Whether a board that knocks is on screen. The switch lives in the header on every page; only
 * here may an activation wake the graph — waking claims the device's audio session, and on iOS
 * that stops the player's music.
 */
export const soundOnStage = computed(() => stages.value > 0)

/** Called by a board (or reveal) that plays decoration sound, for as long as it is mounted. */
export function useSoundStage(): void {
  onMounted(() => stages.value++)
  onBeforeUnmount(() => stages.value--)
}

/**
 * Whether the app's graph is running. A browser lets it start only after a user activation, and a
 * finger setting down is none: after a fresh load the first drag is silent, whatever the setting.
 *
 *   load ──▶ asleep ──(tap, release or key anywhere, while a board knocks)──▶ awake
 *
 * The graph is built only once a board asks for sound. Without Web Audio there is nothing to wait
 * for: awake.
 */
export function useSoundAwake(): Readonly<Ref<boolean>> {
  const sound = useGameSound()
  const awake = ref(false)

  let graph: AudioContext | null = null
  const follow = (): void => {
    awake.value = graph === null || graph.state === 'running'
  }

  watch(
    soundOnStage,
    (onStage) => {
      if (!onStage || graph !== null) return
      graph = audioGraph()
      follow()
      graph?.addEventListener('statechange', follow)
    },
    { immediate: true },
  )
  onBeforeUnmount(() => graph?.removeEventListener('statechange', follow))

  const wake = (event: Event): void => {
    // A touch `pointerdown` is no activation: the resume would be refused.
    if (event.type === 'pointerdown' && (event as PointerEvent).pointerType !== 'mouse') return
    if (soundOnStage.value && sound.value && !awake.value) unlockSound()
  }
  // Captured: a game that stops its pointer events must not keep the graph asleep.
  useEventListener(document, ['pointerdown', 'pointerup', 'keydown'], wake, { capture: true })

  return awake
}
