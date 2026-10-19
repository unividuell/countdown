<script setup lang="ts">
/** „Auswertung“ for Platzierung: the shared table, with the clock when the round was timed. */
import { computed } from 'vue'
import { hasDurations } from '@/games/durations'
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import type { ScoreboardColumn } from '@/games/scoreboardColumns'
import type { ScoreRow } from './scoreboard'

const props = defineProps<{
  rows: ScoreRow[]
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** False when this card was already the reveal on arrival: a reload shows the finished table. */
  animate: boolean
}>()

const columns = computed<ScoreboardColumn<ScoreRow>[]>(() =>
  hasDurations(props.rows)
    ? [{ key: 'clock', label: '[mm:ss]', width: '3.5rem', align: 'end' as const }]
    : [],
)
</script>

<template>
  <RevealScoreboard
    :rows="props.rows"
    :columns="columns"
    caption="Alle Tipps der Runde, nach Punkten sortiert"
    :live="props.live"
    :animate="props.animate"
  >
    <template #cell-clock="{ row }">
      <span class="font-mono text-xs">{{ row.durationLabel ?? '—' }}</span>
    </template>
  </RevealScoreboard>
</template>
