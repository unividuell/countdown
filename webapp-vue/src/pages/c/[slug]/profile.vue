<script setup lang="ts">
/**
 * The community-bound half sits on top: inside a community, that is the identity that applies here
 * and now. Refreshing after a save is what lets the header follow — the shell owns that data.
 */
import CommunityProfileBlock from '@/profile/CommunityProfileBlock.vue'
import GlobalProfileBlock from '@/profile/GlobalProfileBlock.vue'
import { useCommunityContext } from '@/communities/context'

const { community, refresh } = useCommunityContext()

function onSaved(): void {
  refresh().catch((e) => console.error('could not refresh the community', e))
}
</script>

<template>
  <section class="mx-auto max-w-lg space-y-4 py-8">
    <h1 class="text-xl font-semibold">Profil</h1>
    <CommunityProfileBlock
      :slug="community.slug"
      :community-name="community.name"
      @saved="onSaved"
    />
    <GlobalProfileBlock />
  </section>
</template>
