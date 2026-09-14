<script setup lang="ts">
/**
 * „Auswertung“ for Farbausmalung: every ranked guess of the round, best first.
 *
 * The table itself is `RevealScoreboard`; what this file decides is what stands between „Name“ and
 * „Pkt“. Colour does two jobs in it and both carry meaning — identity (the row *is* the player, in
 * the colour their avatar has above the card) and value (the guess as a surface, directly under the
 * solution as a surface). The guess cell is therefore the one cell in the table that is not the
 * row's own colour.
 */
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import type { ScoreboardColumn } from '@/games/scoreboardColumns'
import type { ScoreboardRow, ScoreboardSolution } from './scoreboard'

const props = defineProps<{
  rows: ScoreboardRow[]
  solution: ScoreboardSolution
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** False when this card was already the reveal on arrival: a reload shows the finished table. */
  animate: boolean
}>()

const COLUMNS: ScoreboardColumn<ScoreboardRow>[] = [
  {
    key: 'tip',
    label: 'Tipp',
    width: '3.5rem',
    align: 'end',
    numeric: true,
    ground: (row) => ({ backgroundColor: row.guessHex, color: row.guessInk }),
  },
  { key: 'deviation', label: 'Differenz', width: '3.5rem', align: 'end', numeric: true },
]

const oneDecimal = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

function degrees(value: number): string {
  return oneDecimal.format(value)
}
</script>

<template>
  <RevealScoreboard
    v-if="props.rows.length > 0"
    :rows="props.rows"
    :columns="COLUMNS"
    solution-column="tip"
    caption="Alle Tipps der Runde, nach Abstand zur Lösung sortiert"
    :live="props.live"
    :animate="props.animate"
  >
    <!-- The solution is nobody's row, so it brings its own surface into the bare head cell. -->
    <template #solution>
      <span
        data-test="hue-scoreboard-solution"
        class="block px-0.5 text-end tabular-nums"
        :style="{ backgroundColor: props.solution.hex, color: props.solution.ink }"
      >
        {{ degrees(props.solution.hue) }}
      </span>
    </template>
    <template #cell-tip="{ row }">{{ degrees(row.hue) }}</template>
    <template #cell-deviation="{ row }">{{ degrees(row.deviationDeg) }}</template>
  </RevealScoreboard>
</template>
