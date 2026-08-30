<script setup lang="ts">
/**
 * The card after the round: the tip grid and the scoreboard, one below the other.
 *
 * Two isolated components, not one — the grid is this game's own review surface (photo, flag,
 * votes), the scoreboard is the scoring table every other game's reveal already carries. Folding
 * them together would make this the one scoreboard in the collection that no longer looks like
 * the others, and would give the grid a reason to reach into scoring it does not need.
 */
import type { RoundReview } from '@/rounds/review'
import InfoBox from '@/ui/InfoBox.vue'
import SpotObjectReviewRules from './SpotObjectReviewRules.vue'
import SpotObjectScoreboard from './SpotObjectScoreboard.vue'
import SpotObjectTipGrid from './SpotObjectTipGrid.vue'
import type { ScoreRow, TipTile } from './tips'

const props = defineProps<{
  tiles: TipTile[]
  rows: ScoreRow[]
  live: boolean
  animate: boolean
  canVote: boolean
  review: RoundReview
}>()
</script>

<template>
  <div data-test="spot-reveal" class="flex flex-col gap-6">
    <SpotObjectTipGrid :tiles="props.tiles" :can-vote="props.canVote" :review="props.review" />
    <!-- Between the two: it explains the grid above it, and the scoreboard stays the last word.
         Only where there is something to explain — without a ballot of your own the grid carries no
         buttons, and rules for a control that is not there are just more to read past. -->
    <InfoBox v-if="props.canVote" storage-key="spot-object-review">
      <template #abstract>Bewertet die Tipps der anderen.</template>
      <SpotObjectReviewRules />
    </InfoBox>

    <SpotObjectScoreboard :rows="props.rows" :live="props.live" :animate="props.animate" />
  </div>
</template>
