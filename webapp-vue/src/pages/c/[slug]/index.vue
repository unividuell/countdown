<script setup lang="ts">
import { computed } from 'vue'
import { useCommunityContext } from '@/communities/context'
import { useRoster } from '@/members/useRoster'
import MemberRow from '@/members/MemberRow.vue'
import RoundFallback from '@/communities/fallbacks/RoundFallback.vue'

const { community } = useCommunityContext()
const { members, state } = useRoster(community.value.slug)

// null means "not known yet" and holds the card at a placeholder, so only 'loading' gets it. A
// failed roster never retries, so mapping it to null would hide the card forever; [] lets the
// event-running state say its closing line, and the error above still reports the failure.
const settledMembers = computed(() => {
  if (state.value === 'ready') return members.value
  return state.value === 'failed' ? [] : null
})
</script>

<template>
  <!-- The section owns the height, so all three states are the same height by construction rather
       than by three numbers agreeing. 72px is the row's *tall* variant: a 48px avatar, plus 10 for
       the points badge and 10 for the live-points badge (16px each, pulled up 6 by -mt-1.5), plus
       the row's own 2px padding top and bottom. The tall variant is reserved even for a roster where
       nobody holds live points — that case is 62px, and reserving the smaller value is what used to
       drop the card 10px the moment the roster landed. -->
  <section class="flex min-h-[72px] items-center">
    <MemberRow v-if="state === 'ready'" :members="members" />
    <p v-else-if="state === 'failed'" data-test="roster-error" class="text-sm text-neutral-500">
      Die Mitglieder konnten nicht geladen werden.
    </p>
    <div v-else data-test="roster-placeholder" class="w-full" aria-hidden="true" />
  </section>
  <RoundFallback :community="community" :members="settledMembers" class="mt-6" />
</template>
