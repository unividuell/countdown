<script setup lang="ts">
/**
 * The community-bound half sits on top: inside a community, that is the identity that applies here
 * and now. Refreshing after a save is what lets the header follow — the shell owns that data.
 */
import { useTemplateRef } from 'vue'
import CommunityProfileBlock from '@/profile/CommunityProfileBlock.vue'
import GlobalProfileBlock from '@/profile/GlobalProfileBlock.vue'
import { useCommunityContext } from '@/communities/context'

const { community, refresh } = useCommunityContext()
const communityBlock = useTemplateRef<InstanceType<typeof CommunityProfileBlock>>('communityBlock')

function refreshCommunity(): void {
  refresh().catch((e) => console.error('could not refresh the community', e))
}

/**
 * A global save moves this community's answer too, wherever no override overrules it. The header
 * reads the community's own copy of the viewer identity and prefers it, so without this refresh it
 * would keep drawing the pre-save initials while the roster on this very page shows the new name —
 * and the guard's "same slug, already loaded" shortcut means navigating away and back would not
 * repair it either. The block above states the inherited name in words and needs the same news.
 */
function onGlobalSaved(): void {
  refreshCommunity()
  communityBlock.value?.refreshInherited()
}
</script>

<template>
  <section class="mx-auto max-w-lg space-y-4 py-8">
    <h1 class="text-xl font-semibold">Profil</h1>
    <CommunityProfileBlock
      ref="communityBlock"
      :slug="community.slug"
      :community-name="community.name"
      @saved="refreshCommunity"
    />
    <GlobalProfileBlock @saved="onGlobalSaved" />
  </section>
</template>
