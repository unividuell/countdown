import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Ref } from 'vue'
import { getRoster } from '@/api/communities'
import type { RosterMemberResponse } from '@/api/types'
import { prefersReducedMotion } from '@/ui/motion'

export type RosterState = 'loading' | 'ready' | 'failed'

/**
 * How long the ranking waits after a guess before it catches up — the roster's own budget, not any
 * one game's timetable. The live-points chip carries the round's points, and the roster's answer
 * has them the instant the guess is accepted; a game that is still revealing them would be told
 * from above what it was about to say. Nothing here knows *which* game is playing, and nothing
 * synchronises with it: a game gets this long to tell its story, and that is the whole contract.
 *
 * The number comes from the longest choreography we have. Guess Hue's reveal starts its rows at
 * `RESULTS_DELAY_MS` (1900 ms) and cascades for at most `TYPE_BUDGET_MS` (1200 ms) plus the last
 * column's `3 · CELL_STAGGER_MS` (135 ms) and a `FADE_MS` (300 ms) to arrive — ~3535 ms, plus a
 * beat of air so the ranking lands after the table rather than into its last row. A new game whose
 * reveal runs longer raises this constant; it does not reach into it.
 */
export const SPOILER_HOLD_MS = 3800

export function useRoster(slug: string): {
  members: Ref<RosterMemberResponse[]>
  state: Ref<RosterState>
  reload: () => Promise<void>
  refresh: () => Promise<void>
  refreshAfterGuess: () => void
} {
  const members = ref<RosterMemberResponse[]>([])
  const state = ref<RosterState>('loading')
  let hold: ReturnType<typeof setTimeout> | undefined

  /** Entering the community: the row is not there yet, so `state` may swing freely. */
  async function reload(): Promise<void> {
    state.value = 'loading'
    try {
      members.value = await getRoster(slug)
      state.value = 'ready'
    } catch (err) {
      // A silent empty row would read as "this community has no members".
      console.error('[roster] failed to load', err)
      state.value = 'failed'
    }
  }

  /**
   * The same request while the row is already on screen — after a guess, for new points and the new
   * order they imply. It deliberately never touches `state`: the consumer renders the row behind
   * `state === 'ready'`, so a dip through `'loading'` would unmount `MemberRow` and replay its
   * fly-in, which belongs to entering the community and not to every scoring. Replacing `members`
   * is enough, because the mounted row patches badges and order in place.
   *
   * A failed refresh keeps the last known roster instead of tearing the row down for an error line:
   * the guess itself went through, the numbers are merely stale, and the next visit repairs them.
   */
  async function refresh(): Promise<void> {
    try {
      members.value = await getRoster(slug)
    } catch (err) {
      console.error('[roster] failed to refresh', err)
    }
  }

  /**
   * The third entrance: a guess just landed, so the numbers are new *and* a game is now showing
   * them. Holds [SPOILER_HOLD_MS], then does exactly what `refresh` does.
   *
   * Holding the request rather than the chip is deliberate. Hiding only the chip would still let
   * the *order* through, and my avatar overtaking the row is the same spoiler one step quieter.
   *
   * Fire-and-forget by nature — the caller is a DOM event handler, and there is nothing downstream
   * waiting on the numbers — so it returns `void` rather than a promise nobody awaits. Re-arming
   * clears the pending hold instead of stacking a second one, and so does unmounting: a timer that
   * outlives the row would refresh a roster nobody is looking at.
   */
  function refreshAfterGuess(): void {
    clearTimeout(hold)
    // Nothing to protect: the scoreboard shows its whole table at once under reduced motion, so a
    // hold here would be lag for the one reader who explicitly asked for less of it.
    if (prefersReducedMotion()) {
      void refresh()
      return
    }
    hold = setTimeout(() => void refresh(), SPOILER_HOLD_MS)
  }

  onMounted(reload)
  onBeforeUnmount(() => clearTimeout(hold))
  return { members, state, reload, refresh, refreshAfterGuess }
}
