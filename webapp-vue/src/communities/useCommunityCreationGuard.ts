import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/auth/useAuth'

/**
 * Redirects away when the viewer is not cleared to create communities. The backend 403 on
 * `POST /api/communities` is the real gate; this only keeps the URL from being a dead end.
 * `bootstrap()` resolves before the app mounts, so the flag is available in `onMounted`.
 */
export function useCommunityCreationGuard(): void {
  const router = useRouter()
  const { user } = useAuth()
  onMounted(() => {
    if (!user.value?.mayCreateCommunities) void router.replace('/communities')
  })
}
