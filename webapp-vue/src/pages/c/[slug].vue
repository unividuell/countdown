<script setup lang="ts">
import { computed, provide } from 'vue'
import type { Ref } from 'vue'
import { RouterView } from 'vue-router'
import { getCommunity } from '@/api/communities'
import type { CommunityResponse } from '@/api/types'
import { communityKey } from '@/communities/context'
import { communityRoute, publishCommunity } from '@/communities/routeData'

// The router guard resolves the community before this route commits, so the shell
// only ever renders a settled state — there is no loading branch to flash.
const state = computed(() => communityRoute.value)
const community = computed(() =>
  communityRoute.value?.kind === 'ready' ? communityRoute.value.community : null,
)

async function refresh(): Promise<void> {
  const c = community.value
  if (c) publishCommunity(await getCommunity(c.slug))
}

// Non-null inside the 'ready' branch (RouterView only renders then). Children inject this.
provide(communityKey, {
  community: community as unknown as Readonly<Ref<CommunityResponse>>,
  refresh,
})
</script>

<template>
  <div v-if="state?.kind === 'no-access'" class="mx-auto max-w-md py-8 text-center">
    <h1 class="mb-2 text-lg font-semibold">Kein Zugriff</h1>
    <p class="text-sm text-neutral-600">
      Diese Spielgemeinschaft existiert nicht oder du bist kein Mitglied.
    </p>
  </div>
  <div v-else-if="state?.kind === 'error'" class="mx-auto max-w-md py-8 text-center">
    <h1 class="mb-2 text-lg font-semibold">Etwas ist schiefgelaufen</h1>
    <p class="text-sm text-neutral-600">Bitte später erneut versuchen.</p>
  </div>
  <RouterView v-else-if="state?.kind === 'ready'" :key="community?.slug ?? ''" />
</template>
