<script setup lang="ts">
import { computed } from 'vue'
import { useCommunityContext } from '@/communities/context'
import { useRoster } from '@/members/useRoster'
import { useRound } from '@/rounds/useRound'
import MemberRow from '@/members/MemberRow.vue'
import RoundCard from '@/rounds/RoundCard.vue'
import RoundFallback from '@/communities/fallbacks/RoundFallback.vue'

const { community } = useCommunityContext()
const { members, state, refreshAfterGuess } = useRoster(community.value.slug)

// Owned here, not by RoundCard: `useRoster` already lives on this page, and a card that also
// decided the no-game countdown would mix two responsibilities into one component. So the round
// is fetched exactly once, here, and its whole return goes down to RoundCard as props — a second
// `useRound` call (e.g. inside the card) would fetch the same round twice.
const {
  round,
  state: roundState,
  stage,
  busy,
  notice,
  reveal,
  submit,
} = useRound(community.value.slug)

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
       than by three numbers agreeing. 72px is what the row measures: a 48px avatar, plus 10 for the
       points badge and 10 for the live-points chip (16px each, pulled up 6 by -mt-1.5), plus the
       row's own 2px padding top and bottom. The chip holds its line even for a member who has not
       played (see MemberRow), so this is the row's only height — reserving anything smaller is what
       used to drop the card the moment the roster landed, and letting the chip leave the flow is
       what used to lift the ranking the moment the first live points arrived. -->
  <section class="flex min-h-[72px] items-center">
    <MemberRow v-if="state === 'ready'" :members="members" />
    <p v-else-if="state === 'failed'" data-test="roster-error" class="text-sm text-neutral-500">
      Die Mitglieder konnten nicht geladen werden.
    </p>
    <div v-else data-test="roster-placeholder" class="w-full" aria-hidden="true" />
  </section>

  <!-- The round itself needs the same stable-height treatment as the roster above: while it is
       still loading, neither the card nor the fallback is the right answer yet, and showing one
       only to swap it for the other once the response lands would flash a countdown or a game
       board that was never really there. -->
  <div
    v-if="roundState === 'loading'"
    data-test="round-placeholder"
    class="mt-6 aspect-square w-full"
    aria-hidden="true"
  />
  <!-- Checked ahead of the card branch, not inside it — the same order the roster above already
       uses for the same reason: a failed load must never be able to render a play affordance on
       top of it. `stage` can still read `sealed`/`playing`/`done` off a stale response even after
       `state` has flipped to `failed` (the GET succeeded, a later implicit reveal or guess did
       not), so gating on `stage` alone would let a dead button win the race against this line. -->
  <p
    v-else-if="roundState === 'failed'"
    data-test="round-error"
    class="mt-6 text-sm text-neutral-500"
  >
    Die Runde konnte nicht geladen werden.
  </p>
  <RoundCard
    v-else-if="stage !== 'no-game'"
    class="mt-6"
    :round="round"
    :stage="stage"
    :busy="busy"
    :notice="notice"
    :reveal="reveal"
    :submit="submit"
    @guessed="refreshAfterGuess"
  />
  <RoundFallback v-else :community="community" :members="settledMembers" class="mt-6" />
</template>
