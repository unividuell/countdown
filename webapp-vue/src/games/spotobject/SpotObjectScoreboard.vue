<script setup lang="ts">
/**
 * „Auswertung“ for Weltanschauung: every player's score as a row.
 *
 * The table is `RevealScoreboard`, and this game brings the least of any: no tip column at all —
 * Weltanschauung's tip is a photo, and `SpotObjectTipGrid.vue` above this card is already where it
 * lives — so all that is left to decide is whether the round measured time.
 */
import { computed } from 'vue'
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import type { ScoreboardColumn } from '@/games/scoreboardColumns'
import { hasDurations } from './tips'
import type { ScoreRow } from './tips'

const props = defineProps<{
  rows: ScoreRow[]
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** False when this card was already the reveal on arrival: a reload shows the finished table. */
  animate: boolean
}>()

const timed = computed(() => hasDurations(props.rows))

const columns = computed<ScoreboardColumn<ScoreRow>[]>(() =>
  timed.value ? [{ key: 'clock', label: '[mm:ss]', width: '3.5rem', align: 'end' }] : [],
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
