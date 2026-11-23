import { useEventListener } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { unlockSound } from './audio'
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
 * Wakes the graph on any activation while a board knocks and sound is on. The poster's tap does
 * it first; this catches a board with no poster (a reload mid-run) and a graph the OS suspended.
 * A finger setting down is no activation. Muted builds no graph at all.
 */
export function useSoundAwake(): void {
  const sound = useGameSound()

  const wake = (event: Event): void => {
    // A touch `pointerdown` is no activation: the resume would be refused.
    if (event.type === 'pointerdown' && (event as PointerEvent).pointerType !== 'mouse') return
    if (soundOnStage.value && sound.value) unlockSound()
  }
  // Captured: a game that stops its pointer events must not keep the graph asleep.
  useEventListener(document, ['pointerdown', 'pointerup', 'keydown'], wake, { capture: true })
}
