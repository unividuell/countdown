import type { InjectionKey, Ref } from 'vue'
import { inject, ref } from 'vue'
import type { CommunityResponse } from '@/api/types'

export interface CommunityContext {
  community: Readonly<Ref<CommunityResponse>>
  refresh: () => Promise<void>
}
export const communityKey: InjectionKey<CommunityContext> = Symbol('community')

// Name of the community currently in context (the `/[slug]/` shell sets it, clears on leave).
// App.vue drives the tab title from it: `community.name ?? 'countdown'`.
export const activeCommunityName = ref<string | null>(null)

export function useCommunityContext(): CommunityContext {
  const ctx = inject(communityKey)
  if (!ctx) throw new Error('community context not provided (must be used within the [slug] shell)')
  return ctx
}
