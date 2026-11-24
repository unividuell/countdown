import { useLocalStorage } from '@vueuse/core'
import type { Ref } from 'vue'

export const GAME_VOLUME_KEY = 'games:volume'

/** Where a fresh device starts, and where unmuting from zero lands. */
export const DEFAULT_VOLUME = 0.8

/** The one sound setting of this device, 0–1, for everything the app plays. Zero is mute. */
export function useGameVolume(): Ref<number> {
  return useLocalStorage(GAME_VOLUME_KEY, DEFAULT_VOLUME)
}

/** The gain for a slider value: squared, so the slider's lower half is not all near-silence. */
export function volumeGain(volume: number): number {
  // A hand-edited value parses to NaN, and a NaN gain throws on assignment.
  if (!Number.isFinite(volume)) return 0

  const v = Math.min(1, Math.max(0, volume))

  return v * v
}
