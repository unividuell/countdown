<script setup lang="ts">
import { computed } from 'vue'
import { useAuth } from '@/auth/useAuth'
import { castVote, roundAssetUrl, setAdminOverride } from '@/api/rounds'
import type { RoundResponse } from '@/api/types'
import { useCommunityContext } from '@/communities/context'
import { useRoster } from '@/members/useRoster'
import type { RoundReview } from '@/rounds/review'
import { useRound } from '@/rounds/useRound'
import MemberRow from '@/members/MemberRow.vue'
import RoundCard from '@/rounds/RoundCard.vue'
import RoundFallback from '@/communities/fallbacks/RoundFallback.vue'
import RoundHistory from '@/rounds/RoundHistory.vue'

const { community } = useCommunityContext()
const { members, state, refreshAfterGuess } = useRoster(community.value.slug)
// The row rearranges itself after a guess, and only the viewer's own climb boxes its way forward
// (see members/reorder.ts). The session and the roster meet here, nowhere further down.
const { user } = useAuth()

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
  skip,
  giveUp,
} = useRound(community.value.slug)

/** The asset lives at `{slug}/rounds/{roundNumber}/assets/{key}` — this round's own. */
const assetUrl = (key: number): string =>
  roundAssetUrl(community.value.slug, round.value?.round?.number ?? 0, key)

/**
 * The ballot on somebody else's play. Both calls answer with the whole round, so nothing here is
 * derived locally — the server's own re-evaluation is what the grid then renders.
 */
const review = computed<RoundReview>(() => ({
  canOverride: round.value?.canOverride ?? false,
  vote: (userId, value) =>
    ballot(() => castVote(community.value.slug, roundNumber(), userId, value)),
  override: (userId, value) =>
    ballot(() => setAdminOverride(community.value.slug, roundNumber(), userId, value)),
}))

const roundNumber = () => round.value?.round?.number ?? 0

/**
 * Never rejects, by contract with `RoundReview`: a refused ballot — the round moved on, somebody
 * else is not an admin after all — says so in the same notice a refused guess uses, rather than
 * escaping into the grid, which has no place to put a sentence.
 */
async function ballot(action: () => Promise<RoundResponse>): Promise<void> {
  notice.value = null
  try {
    round.value = await action()
  } catch (err) {
    console.error('[review] ballot failed', err)
    notice.value = 'Die Wertung konnte nicht gespeichert werden.'
  }
}

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
    <MemberRow v-if="state === 'ready'" :members="members" :me-id="user?.id" />
    <p v-else-if="state === 'failed'" data-test="roster-error" class="text-sm text-neutral-500">
      Die Mitglieder konnten nicht geladen werden.
    </p>
    <div v-else data-test="roster-placeholder" class="w-full" aria-hidden="true" />
  </section>

  <!-- The round itself needs the same stable-height treatment as the roster above: while it is
       still loading, neither the card nor the fallback is the right answer yet, and showing one
       only to swap it for the other once the response lands would flash a countdown or a game
       board that was never really there. -->
  <!-- Same width as the card that will replace it: `aspect-square` makes the reserved height the
       reserved width, so a placeholder that does not bleed reserves 32px too little and the page
       drops when the response lands. No `w-full` — a definite width would shift the box instead of
       widening it. -->
  <div
    v-if="roundState === 'loading'"
    data-test="round-placeholder"
    class="round-bleed mt-6 aspect-square"
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
    :skip="skip"
    :give-up="giveUp"
    :asset-url="assetUrl"
    :review="review"
    @guessed="refreshAfterGuess"
  />
  <RoundFallback v-else :community="community" :members="settledMembers" class="mt-6" />

  <!-- Under the card AND under the fallback: after the event the fallback is what stands here, and
       looking back is then the only reason left to open the page. Held until the round has landed,
       so the entry point is the real one rather than a `null` that would immediately be replaced. -->
  <RoundHistory
    v-if="roundState === 'ready'"
    :slug="community.slug"
    :from="round?.previousRoundNumber ?? null"
  />
</template>
