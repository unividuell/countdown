<script setup lang="ts">
/**
 * „Auswertung“ for Augenmaß: the shared table with the tip and its signed distance from the
 * truth. The name is a button — tapping it toggles that player's outline on the reveal's field.
 *
 *                   Lösung  Toleranz
 *   Auswertung       2,77×    ± 10 %
 *   Name             Tipp    Abstand   Pkt
 *   anna             1,9×     −31 %     0
 */
import { computed } from 'vue'
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import type { ScoreboardColumn } from '@/games/scoreboardColumns'
import { formatFactor, formatTolerance, type ScoreboardRow } from './scoreboard'

const props = defineProps<{
  rows: ScoreboardRow[]
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** False when this card was already the reveal on arrival: a reload shows the finished table. */
  animate: boolean
  /** Whose outlines are on the field. */
  selected: readonly string[]
  /** The true factor between A and B. */
  factor: number
  /** `null` in phase two — there is no gate there. */
  toleranceFactor: number | null
  /** When the rows start landing: after B's growth. */
  resultsDelayMs?: number
}>()

const emit = defineEmits<{ select: [userId: string] }>()

const columns = computed<ScoreboardColumn<ScoreboardRow>[]>(() => [
  { key: 'tip', label: 'Tipp', fact: 'Lösung', width: '3.5rem', align: 'end', numeric: true },
  {
    key: 'off',
    label: 'Abstand',
    ...(props.toleranceFactor === null ? {} : { fact: 'Toleranz' }),
    width: '4rem',
    align: 'end',
    numeric: true,
  },
])

/** Like PaintRatio's head values: the solution row's ground, right-aligned like the column. */
const FACT = 'block bg-surface-container-highest px-0.5 text-end text-on-surface tabular-nums'
</script>

<template>
  <RevealScoreboard
    :rows="props.rows"
    :columns="columns"
    caption="Alle Tipps der Runde, nach Punkten sortiert"
    :live="props.live"
    :animate="props.animate"
    :results-delay-ms="props.resultsDelayMs"
  >
    <template #name="{ row }">
      <button
        type="button"
        :data-test="`select-${row.userId}`"
        class="flex w-full cursor-pointer items-baseline gap-1 text-start focus-visible:outline-2 focus-visible:-outline-offset-2"
        :aria-pressed="props.selected.includes(row.userId)"
        @click="emit('select', row.userId)"
      >
        <span
          class="min-w-0 truncate"
          :class="props.selected.includes(row.userId) ? 'font-semibold underline' : ''"
          >{{ row.name }}</span
        >
      </button>
    </template>

    <template #fact-tip>
      <span data-test="match-scale-solution" :class="FACT">{{ formatFactor(props.factor) }}×</span>
    </template>
    <template v-if="props.toleranceFactor !== null" #fact-off>
      <span data-test="match-scale-tolerance" :class="FACT">{{
        formatTolerance(props.toleranceFactor)
      }}</span>
    </template>

    <template #cell-tip="{ row }">{{ row.tip }}</template>
    <template #cell-off="{ row }">{{ row.off }}</template>
  </RevealScoreboard>
</template>
