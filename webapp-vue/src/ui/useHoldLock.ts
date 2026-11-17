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
