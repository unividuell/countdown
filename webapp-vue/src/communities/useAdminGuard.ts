import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCommunityContext } from '@/communities/context'

/** Redirects to the community root if the viewer is not an admin. Backend `requireAdmin` is the real gate. */
export function useAdminGuard(): void {
  const router = useRouter()
  const { community } = useCommunityContext()
  onMounted(() => {
    if (!community.value.viewerIsAdmin) void router.replace(`/${community.value.slug}/`)
  })
}
