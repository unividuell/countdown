<script setup lang="ts">
/**
 * „Auswertung“ for Verrohrung: the shared table, no column of its own. The name is a button —
 * tapping it shows that player's tip on the reveal's grid.
 */
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import type { ScoreboardColumn } from '@/games/scoreboardColumns'
import type { ScoreRow } from './scoreboard'

const props = defineProps<{
  rows: ScoreRow[]
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** False when this card was already the reveal on arrival: a reload shows the finished table. */
  animate: boolean
  selectedUserId: string | null
  /** Rows wait for the verdict, which comes after the water. */
  resultsHeld: boolean
}>()

const emit = defineEmits<{ select: [userId: string] }>()

const NO_COLUMNS: ScoreboardColumn<ScoreRow>[] = []
</script>

<template>
  <RevealScoreboard
    :rows="props.rows"
    :columns="NO_COLUMNS"
    caption="Alle Tipps der Runde, nach Punkten sortiert"
    :live="props.live"
    :animate="props.animate"
    :results-held="props.resultsHeld"
  >
    <template #name="{ row }">
      <button
        type="button"
        :data-test="`select-${row.userId}`"
        class="flex w-full cursor-pointer items-baseline gap-1 text-start focus-visible:outline-2 focus-visible:-outline-offset-2"
        :aria-pressed="props.selectedUserId === row.userId"
        @click="emit('select', row.userId)"
      >
        <span
          class="min-w-0 truncate"
          :class="props.selectedUserId === row.userId ? 'font-semibold underline' : ''"
          >{{ row.name }}</span
        >
      </button>
    </template>
  </RevealScoreboard>
</template>
