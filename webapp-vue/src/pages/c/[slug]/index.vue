<script setup lang="ts">
import { computed } from 'vue'
import { useCommunityContext } from '@/communities/context'
import { useRoster } from '@/members/useRoster'
import { useRound } from '@/rounds/useRound'
import MemberRow from '@/members/MemberRow.vue'
import RoundCard from '@/rounds/RoundCard.vue'
import RoundFallback from '@/communities/fallbacks/RoundFallback.vue'

const { community } = useCommunityContext()
const { members, state, reload: reloadRoster } = useRoster(community.value.slug)

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
  <RoundCard
    v-else-if="stage !== 'no-game'"
    class="mt-6"
    :round="round"
    :stage="stage"
    :busy="busy"
    :notice="notice"
    :reveal="reveal"
    :submit="submit"
    @guessed="reloadRoster"
  />
  <!-- A failed load leaves `round` null, same as "no game" — but the two are not the same fact,
       and the roster right above already draws this distinction for the exact same reason: a
       transient 500 must say so, not quietly present the running-event fallback as if the round
       had simply never existed. -->
  <p
    v-else-if="roundState === 'failed'"
    data-test="round-error"
    class="mt-6 text-sm text-neutral-500"
  >
    Die Runde konnte nicht geladen werden.
  </p>
  <RoundFallback v-else :community="community" :members="settledMembers" class="mt-6" />
</template>
