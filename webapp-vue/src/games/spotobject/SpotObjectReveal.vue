<script setup lang="ts">
/**
 * The card after the round: the tip grid and the scoreboard, one below the other.
 *
 * Two isolated components, not one — the grid is this game's own review surface (photo, flag,
 * votes), the scoreboard is the scoring table every other game's reveal already carries. Folding
 * them together would make this the one scoreboard in the collection that no longer looks like
 * the others, and would give the grid a reason to reach into scoring it does not need.
 */
import type { RouteLocationRaw } from 'vue-router'
import SpotObjectScoreboard from './SpotObjectScoreboard.vue'
import SpotObjectTipGrid from './SpotObjectTipGrid.vue'
import type { ScoreRow, TipTile } from './tips'

const props = defineProps<{
  tiles: TipTile[]
  rows: ScoreRow[]
  live: boolean
  animate: boolean
  tipPath: (userId: string) => RouteLocationRaw
}>()
</script>

<template>
  <div data-test="spot-reveal" class="flex flex-col gap-6">
    <SpotObjectTipGrid :tiles="props.tiles" :tip-path="props.tipPath" />
    <SpotObjectScoreboard :rows="props.rows" :live="props.live" :animate="props.animate" />
  </div>
</template>
