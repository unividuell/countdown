<script setup lang="ts">
/** „Auswertung“ for Platzierung: the shared table, with the clock when the round was timed. */
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import type { ScoreRow } from './scoreboard'

const props = defineProps<{
  rows: ScoreRow[]
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
}>()
</script>

<template>
  <RevealScoreboard
    :rows="props.rows"
    :columns="[]"
    caption="Alle Tipps der Runde, nach Punkten sortiert"
    :live="props.live"
  />
</template>
