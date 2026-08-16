import { onMounted, ref } from 'vue'
import type { Ref } from 'vue'
import { getRoster } from '@/api/communities'
import type { RosterMemberResponse } from '@/api/types'

export type RosterState = 'loading' | 'ready' | 'failed'

export function useRoster(slug: string): {
  members: Ref<RosterMemberResponse[]>
  state: Ref<RosterState>
  reload: () => Promise<void>
  refresh: () => Promise<void>
} {
  const members = ref<RosterMemberResponse[]>([])
  const state = ref<RosterState>('loading')

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

  onMounted(reload)
  return { members, state, reload, refresh }
}
