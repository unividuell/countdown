import { computed, type ComputedRef } from 'vue'
import type { GameEntry } from '@/games/GameEntry'

/**
 * The viewer's avatar colour, for marking their own tip on the board. Grey until their row
 * arrives, so a player still sees their own mark before the server has it.
 */
export function useMyColorHex(
  entries: () => readonly GameEntry[],
  mineUserId: () => string | null,
): ComputedRef<string> {
  return computed(
    () => entries().find((entry) => entry.userId === mineUserId())?.avatar.bgColorHex ?? '#525252',
  )
}
