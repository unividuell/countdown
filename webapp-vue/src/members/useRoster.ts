import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Ref } from 'vue'
import { getRoster } from '@/api/communities'
import type { RosterMemberResponse } from '@/api/types'
import { prefersReducedMotion } from '@/ui/motion'
import { afterResultsLand } from '@/ui/resultsLanding'

export type RosterState = 'loading' | 'ready' | 'failed'

export function useRoster(slug: string): {
  members: Ref<RosterMemberResponse[]>
  state: Ref<RosterState>
  reload: () => Promise<void>
  refresh: () => Promise<void>
  refreshAfterGuess: () => void
} {
  const members = ref<RosterMemberResponse[]>([])
  const state = ref<RosterState>('loading')
  let cancelHold: (() => void) | undefined
  /** Bumped by every guess and by leaving: an answer from an older hold shows nothing. */
  let holds = 0

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
   * them. The roster's answer has the round's points the instant the guess is accepted; shown then,
   * it would tell from above what the reveal is about to say. So it asks at once and shows the
   * answer when the reveal's results land (`ui/resultsLanding`) — with the verdict, not before.
   *
   * Holding the answer rather than the chip is deliberate. Hiding only the chip would still let
   * the *order* through, and my avatar overtaking the row is the same spoiler one step quieter.
   *
   * Fire-and-forget by nature — the caller is a DOM event handler, and there is nothing downstream
   * waiting on the numbers — so it returns `void` rather than a promise nobody awaits. A second
   * guess replaces the pending hold, and unmounting drops it.
   */
  function refreshAfterGuess(): void {
    cancelHold?.()
    const hold = ++holds
    // Nothing to protect: the scoreboard shows its whole table at once under reduced motion, so a
    // hold here would be lag for the one reader who explicitly asked for it.
    if (prefersReducedMotion()) {
      void refresh()
      return
    }

    let answer: RosterMemberResponse[] | null = null
    let landed = false
    function show(): void {
      if (hold === holds && landed && answer !== null) members.value = answer
    }

    cancelHold = afterResultsLand(() => {
      landed = true
      show()
    })

    getRoster(slug).then(
      (next) => {
        answer = next
        show()
      },
      (err: unknown) => console.error('[roster] failed to refresh', err),
    )
  }

  onMounted(reload)
  onBeforeUnmount(() => {
    cancelHold?.()
    holds++
  })
  return { members, state, reload, refresh, refreshAfterGuess }
}
