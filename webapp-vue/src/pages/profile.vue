<script setup lang="ts">
import { computed } from 'vue'
import CommunityProfileBlock from '@/profile/CommunityProfileBlock.vue'
import GlobalProfileBlock from '@/profile/GlobalProfileBlock.vue'
import { useCommunities } from '@/communities/useCommunities'

const { active, severalCommunities } = useCommunities()

// A member of exactly one community edits that community, the same as on its own profile page.
const sole = computed(() => (active.value.length === 1 ? active.value[0]! : null))
</script>

<template>
  <section class="mx-auto max-w-lg space-y-4 py-8">
    <h1 class="text-xl font-semibold">Profil</h1>
    <CommunityProfileBlock
      v-if="sole"
      :key="sole.slug"
      :slug="sole.slug"
      :community-name="sole.name"
      sole
    />
    <GlobalProfileBlock v-else :several-communities="severalCommunities" />
  </section>
</template>
