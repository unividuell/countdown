import { onMounted, ref } from 'vue'
import type { Ref } from 'vue'
import { getRoster } from '@/api/communities'
import type { RosterMemberResponse } from '@/api/types'

export type RosterState = 'loading' | 'ready' | 'failed'

export function useRoster(slug: string): {
  members: Ref<RosterMemberResponse[]>
  state: Ref<RosterState>
  reload: () => Promise<void>
} {
  const members = ref<RosterMemberResponse[]>([])
  const state = ref<RosterState>('loading')

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

  onMounted(reload)
  return { members, state, reload }
}
