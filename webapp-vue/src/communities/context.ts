import type { InjectionKey, Ref } from 'vue'
import { inject } from 'vue'
import type { CommunityResponse } from '@/api/types'

export interface CommunityContext {
  community: Readonly<Ref<CommunityResponse>>
  refresh: () => Promise<void>
}
export const communityKey: InjectionKey<CommunityContext> = Symbol('community')

export function useCommunityContext(): CommunityContext {
  const ctx = inject(communityKey)
  if (!ctx) throw new Error('community context not provided (must be used within the [slug] shell)')
  return ctx
}
