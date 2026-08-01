<script setup lang="ts">
import { onMounted, onUnmounted, provide, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { getCommunity, setSelection } from '@/api/communities'
import { ApiError } from '@/api/client'
import type { CommunityResponse } from '@/api/types'
import { activeCommunity, communityKey } from '@/communities/context'

const route = useRoute('/[slug]')
const community = ref<CommunityResponse | null>(null)
const state = ref<'loading' | 'ready' | 'no-access' | 'error'>('loading')

function publish(c: CommunityResponse): void {
  community.value = c
  activeCommunity.value = {
    slug: c.slug,
    name: c.name,
    startsAt: c.startsAt,
    startsAtTimezone: c.startsAtTimezone,
    viewerIsAdmin: c.viewerIsAdmin,
    pendingCount: c.pendingCount,
  }
}

async function resolve(slug: string): Promise<void> {
  state.value = 'loading'
  try {
    const c = await getCommunity(slug)
    publish(c)
    state.value = 'ready'
    void setSelection(c.id)
  } catch (e) {
    state.value = e instanceof ApiError && e.status === 404 ? 'no-access' : 'error'
    community.value = null
    activeCommunity.value = null
  }
}
async function refresh(): Promise<void> {
  if (community.value) publish(await getCommunity(community.value.slug))
}
// Non-null inside the 'ready' branch (RouterView only renders then). Children inject this.
provide(communityKey, {
  community: community as unknown as Readonly<Ref<CommunityResponse>>,
  refresh,
})

onMounted(() => resolve(String(route.params.slug)))
watch(
  () => route.params.slug,
  (s) => resolve(String(s)),
)
// Leaving the community context → tab title falls back to the app name.
onUnmounted(() => {
  activeCommunity.value = null
})
</script>

<template>
  <div v-if="state === 'loading'" class="py-8 text-center text-sm text-neutral-500">Lade…</div>
  <div v-else-if="state === 'no-access'" class="mx-auto max-w-md py-8 text-center">
    <h1 class="mb-2 text-lg font-semibold">Kein Zugriff</h1>
    <p class="text-sm text-neutral-600">
      Diese Spielgemeinschaft existiert nicht oder du bist kein Mitglied.
    </p>
  </div>
  <div v-else-if="state === 'error'" class="mx-auto max-w-md py-8 text-center">
    <h1 class="mb-2 text-lg font-semibold">Etwas ist schiefgelaufen</h1>
    <p class="text-sm text-neutral-600">Bitte später erneut versuchen.</p>
  </div>
  <RouterView v-else />
</template>
