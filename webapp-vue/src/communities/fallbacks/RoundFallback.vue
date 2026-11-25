<script setup lang="ts">
import { computed } from 'vue'
import type { CommunityResponse, RosterMemberResponse } from '@/api/types'
import { useCountdown } from '@/communities/useCountdown'
import { formatWinnerNames, winners } from '@/members/winner'
import CountdownCard from './CountdownCard.vue'
import MessageCard from './MessageCard.vue'
import { NO_DATE_MESSAGE, RUNNING_MESSAGE } from './messages'
import { pickPoster } from './poster/posters'

const props = withDefaults(
  defineProps<{
    community: CommunityResponse
    members: readonly RosterMemberResponse[] | null
    // Under a game round: the board while it counts down, nothing else. The messages would talk
    // over the game, and a placeholder would hold a square below it for nothing.
    countdownOnly?: boolean
  }>(),
  { countdownOnly: false },
)

// A null slug keeps useCountdown from firing: without an edition there is nothing to count. Tested
// against null exactly as the template branch below is, so no third case can slip between them.
const slug = computed(() => (props.community.edition === null ? null : props.community.slug))
const { view } = useCountdown(slug)

const chip = (i: number) => view.value.chips[i]?.value ?? '00'
const days = computed(() => chip(0).padStart(2, '0'))
const hours = computed(() => chip(1))
const minutes = computed(() => chip(2))
const seconds = computed(() => chip(3))

const winnerNames = computed(() =>
  props.members === null ? '' : formatWinnerNames(winners(props.members).map((m) => m.fullName)),
)

// The edition closes on one poster, drawn from its id: the same on every device and every visit.
const poster = computed(() => {
  const edition = props.community.edition
  if (edition === null) return null
  return {
    component: pickPoster(edition.id).component,
    title: edition.label ?? props.community.name,
    targetAt: edition.targetAt,
    targetTimezone: edition.targetTimezone,
    gameRounds: edition.gamesUntilRound - edition.gamesFromRound + 1,
  }
})
</script>

<template>
  <MessageCard
    v-if="community.edition === null"
    data-test="fallback-no-date"
    v-bind="NO_DATE_MESSAGE"
  />
  <CountdownCard
    v-else-if="view.state === 'before'"
    :days="days"
    :hours="hours"
    :minutes="minutes"
    :seconds="seconds"
  />
  <template v-else-if="countdownOnly" />
  <component
    :is="poster.component"
    v-else-if="view.state === 'after' && members !== null && winnerNames !== '' && poster"
    data-test="fallback-winner"
    :title="poster.title"
    :target-at="poster.targetAt"
    :target-timezone="poster.targetTimezone"
    :members="members"
    :game-rounds="poster.gameRounds"
  />
  <MessageCard
    v-else-if="view.state === 'after' && members !== null"
    data-test="fallback-running"
    v-bind="RUNNING_MESSAGE"
  />
  <div
    v-else
    data-test="fallback-placeholder"
    class="round-bleed aspect-square"
    aria-hidden="true"
  />
</template>
