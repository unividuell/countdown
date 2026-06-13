<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCommunities } from '@/communities/useCommunities'

const router = useRouter()
const { landing } = useCommunities()

onMounted(async () => {
  const l = await landing()
  if (l.kind === 'none' || l.kind === 'choose') router.replace('/communities')
  else router.replace(`/${l.slug}/`)
})
</script>

<template>
  <p class="py-8 text-center text-sm text-neutral-500">Lade deine Spielgemeinschaften…</p>
</template>
