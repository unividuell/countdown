<script setup lang="ts">
import { computed } from 'vue'
import type { CommunityResponse, RosterMemberResponse } from '@/api/types'
import { useCountdown } from '@/communities/useCountdown'
import { formatWinnerNames, winners } from '@/members/winner'
import CountdownCard from './CountdownCard.vue'
import MessageCard from './MessageCard.vue'

const props = defineProps<{
  community: CommunityResponse
  members: readonly RosterMemberResponse[] | null
}>()

// A null slug keeps useCountdown from firing: without a startsAt there is nothing to count. Tested
// against null exactly as the template branch below is, so no third case can slip between them.
const slug = computed(() => (props.community.startsAt === null ? null : props.community.slug))
const { view } = useCountdown(slug)

const chip = (i: number) => view.value.chips[i]?.value ?? '00'
const days = computed(() => chip(0).padStart(2, '0'))
const hours = computed(() => chip(1))
const minutes = computed(() => chip(2))
const seconds = computed(() => chip(3))

const winnerNames = computed(() =>
  props.members === null ? '' : formatWinnerNames(winners(props.members).map((m) => m.fullName)),
)
</script>

<template>
  <MessageCard
    v-if="community.startsAt === null"
    data-test="fallback-no-date"
    title="Noch kein Termin"
    text="Diese Spielgemeinschaft entsteht gerade. Komm später wieder."
  />
  <CountdownCard
    v-else-if="view.state === 'before'"
    :days="days"
    :hours="hours"
    :minutes="minutes"
    :seconds="seconds"
  />
  <MessageCard
    v-else-if="view.state === 'after' && members !== null && winnerNames !== ''"
    data-test="fallback-winner"
    :title="`Herzlichen Glückwunsch, ${winnerNames}!`"
    text="Und jetzt viel Spaß zusammen!"
  />
  <MessageCard
    v-else-if="view.state === 'after' && members !== null"
    data-test="fallback-running"
    title="Und jetzt viel Spaß zusammen!"
  />
  <div v-else data-test="fallback-placeholder" class="aspect-square w-full" aria-hidden="true" />
</template>
