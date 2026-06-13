<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCommunities } from '@/communities/useCommunities'
import { consumePostLoginRedirect } from '@/auth/postLoginRedirect'

const router = useRouter()
const { landing } = useCommunities()

onMounted(async () => {
  // If the user was bounced to login from a specific destination (e.g. /join/<token>),
  // return there instead of the default landing.
  const pending = consumePostLoginRedirect()
  if (pending) {
    router.replace(pending)
    return
  }
  const l = await landing()
  if (l.kind === 'none' || l.kind === 'choose') router.replace('/communities')
  else router.replace(`/${l.slug}/`)
})
</script>

<template>
  <p class="py-8 text-center text-sm text-neutral-500">Lade deine Spielgemeinschaften…</p>
</template>
