import { computed, type WritableComputedRef } from 'vue'
import { DEFAULT_VOLUME, useGameVolume } from './useGameVolume'

/**
 * Sound on or off, read from the volume: zero is mute. Off sets zero; on from zero jumps to the
 * default rather than to whatever sliver the slider was dragged down past.
 */
export function useGameSound(): WritableComputedRef<boolean> {
  const volume = useGameVolume()

  return computed({
    get: () => volume.value > 0,
    set: (on) => {
      if (!on) volume.value = 0
      else if (volume.value === 0) volume.value = DEFAULT_VOLUME
    },
  })
}
