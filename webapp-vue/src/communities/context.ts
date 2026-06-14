import type { InjectionKey, Ref } from 'vue'
import { inject, ref } from 'vue'
import type { CommunityResponse } from '@/api/types'

export interface CommunityContext {
  community: Readonly<Ref<CommunityResponse>>
  refresh: () => Promise<void>
}
export const communityKey: InjectionKey<CommunityContext> = Symbol('community')

/** The community currently in context (the `/[slug]/` shell sets it, clears on leave). Read by the
 *  App-level main header, which lives ABOVE the `[slug]` provider tree (so a module ref, not inject). */
export interface ActiveCommunity {
  slug: string
  name: string
  startsAt: string | null
  startsAtTimezone: string
}
export const activeCommunity = ref<ActiveCommunity | null>(null)

export function useCommunityContext(): CommunityContext {
  const ctx = inject(communityKey)
  if (!ctx) throw new Error('community context not provided (must be used within the [slug] shell)')
  return ctx
}
