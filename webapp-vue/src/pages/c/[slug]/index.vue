<script setup lang="ts">
import { computed } from 'vue'
import { useCommunityContext } from '@/communities/context'
import { useRoster } from '@/members/useRoster'
import MemberRow from '@/members/MemberRow.vue'
import RoundFallback from '@/communities/fallbacks/RoundFallback.vue'

const { community } = useCommunityContext()
const { members, state } = useRoster(community.value.slug)

// null, not [], while loading: an empty roster would read as "nobody has scored".
const settledMembers = computed(() => (state.value === 'ready' ? members.value : null))
</script>

<template>
  <section>
    <MemberRow v-if="state === 'ready'" :members="members" />
    <!-- Same height in every state: the row can only fly once its resting places have been
         measured, so a shorter placeholder would make the page jump when the data lands. -->
    <p
      v-else-if="state === 'failed'"
      data-test="roster-error"
      class="flex min-h-[62px] items-center text-sm text-neutral-500"
    >
      Die Mitglieder konnten nicht geladen werden.
    </p>
    <div v-else data-test="roster-placeholder" class="min-h-[62px]" aria-hidden="true" />
  </section>
  <RoundFallback :community="community" :members="settledMembers" class="mt-6" />
</template>
