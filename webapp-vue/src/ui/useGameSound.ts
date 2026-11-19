import { useLocalStorage } from '@vueuse/core'
import type { Ref } from 'vue'

export const GAME_SOUND_KEY = 'games:sound'

/** The one sound setting of this device: mute in one game, silence in all. */
export function useGameSound(): Ref<boolean> {
  return useLocalStorage(GAME_SOUND_KEY, true)
}
