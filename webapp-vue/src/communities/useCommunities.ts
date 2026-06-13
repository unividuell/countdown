import { ref } from 'vue'
import type { CommunitySummary } from '@/api/types'
import { listCommunities, getSelection } from '@/api/communities'

export type Landing =
  | { kind: 'none' }
  | { kind: 'one'; slug: string }
  | { kind: 'last'; slug: string }
  | { kind: 'choose' }

export function resolveLanding(active: CommunitySummary[], lastSelectedId: string | null): Landing {
  if (active.length === 0) return { kind: 'none' }
  if (active.length === 1) return { kind: 'one', slug: active[0]!.slug }
  const last = active.find((c) => c.id === lastSelectedId)
  return last ? { kind: 'last', slug: last.slug } : { kind: 'choose' }
}

const active = ref<CommunitySummary[]>([])
export function useCommunities() {
  async function refresh(): Promise<void> {
    active.value = await listCommunities()
  }
  async function landing(): Promise<Landing> {
    const [list, sel] = await Promise.all([listCommunities(), getSelection()])
    active.value = list
    return resolveLanding(list, sel.communityId)
  }
  return { active, refresh, landing }
}
