import { useEventListener } from '@vueuse/core'
import { ref, type Ref } from 'vue'

export interface HoldLock {
  /** The hold's ring, 0 … 1, as `HoldButton` reports it. */
  progress: Ref<number>
  /** Only while the ring rises: the rewind after a release is no hold. */
  locked: Ref<boolean>
  /** Wire to `HoldButton`'s `progress`. */
  onProgress: (value: number) => void
  /** Call on `confirm`: a guess that fails hands the board back, and it must not stay grey. */
  unlock: () => void
}

/**
 * The board under a submitting hold. Place Patch, Copy Blocks and Paint Ratio grey their field while the ring
 * rises, so what is about to be sent cannot change under the hold — see `HoldLock.vue`.
 */
export function useHoldLock(): HoldLock {
  const progress = ref(0)
  const locked = ref(false)

  // A completed hold reports a full ring after `confirm`; it is no hold in progress any more.
  function onProgress(value: number): void {
    const next = value < 1 ? value : 0
    locked.value = next > progress.value
    progress.value = next
  }

  function unlock(): void {
    progress.value = 0
    locked.value = false
  }

  return { progress, locked, onProgress, unlock }
}

export interface FieldTouch {
  /** A finger is on the field: keep the hold off (`HoldButton`'s `disabled`). */
  touching: Ref<boolean>
  /** Wire to the field's `pointerdown` in the capture phase, ahead of the field's own handler. */
  onDown: (event: PointerEvent) => void
  /** Wire to `pointerup`, `pointercancel` and `lostpointercapture`, also in the capture phase. */
  onUp: (event: PointerEvent) => void
  /** True once for a tap whose finger came down on a locked field: that tap builds nothing. */
  takeTap: () => boolean
}

/**
 * Every finger on a field whose submit hold [locked] says is rising. Any finger keeps the hold off,
 * and the tap of one that came down on the locked field is swallowed — Copy Blocks' and Echo
 * Locate's fields; Place Patch and Paint Ratio track their own gestures.
 */
export function useFieldTouch(locked: Ref<boolean>): FieldTouch {
  const pointers = new Set<number>()
  const touching = ref(false)
  let swallow = false

  function onDown(event: PointerEvent): void {
    pointers.add(event.pointerId)
    touching.value = true
    swallow = locked.value
  }

  function onUp(event: PointerEvent): void {
    if (pointers.delete(event.pointerId) && pointers.size === 0) touching.value = false
  }

  function takeTap(): boolean {
    const taken = swallow
    swallow = false
    return taken
  }

  // A finger lifted while the tab was away may never report it, and would keep the hold off.
  useEventListener(document, 'visibilitychange', () => {
    if (!document.hidden) return
    pointers.clear()
    touching.value = false
  })

  return { touching, onDown, onUp, takeTap }
}
