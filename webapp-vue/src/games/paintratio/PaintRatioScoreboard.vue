<script setup lang="ts">
/**
 * „Auswertung“ for Kreativverhältnis: every painting of the round, nearest to the target first.
 *
 * The table is `RevealScoreboard`; this file adds what stands between „Name“ and „Pkt“ — the
 * painted share and its difference — and what makes the names more than names: each is a button
 * that lays that painting on the canvas. Beneath the table, set apart, the Kollektiv Kommune is
 * the last row, and its button switches the picture itself.
 *
 *   Name                 Anteil   Differenz   Pkt
 *   anna                 41,0 %     -2,3 %     1
 *   ─────────────────────────────────────────────
 *   Kollektiv Kommune    43,3 %      0,0 %     —
 */
import { computed } from 'vue'
import { hasDurations } from '@/games/durations'
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import { FADE_MS, headCellDelayMs, isStill } from '@/games/revealChoreography'
import type { ScoreboardColumn } from '@/games/scoreboardColumns'
import { useRevealArming } from '@/ui/useRevealArming'
import { KOLLEKTIV } from './layers'
import { formatDifference, formatPercent } from './scoreboard'
import type { ScoreRow } from './scoreboard'

const props = defineProps<{
  rows: ScoreRow[]
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** False when this card was already the reveal on arrival: a reload shows the finished table. */
  animate: boolean
  /** The layers on the canvas: user ids and `KOLLEKTIV`. */
  selected: readonly string[]
  /** The Kollektiv's share of the canvas, as a fraction. */
  targetRatio: number
  /** `null` in phase two — there is no gate there. */
  tolerance: number | null
}>()

const emit = defineEmits<{ select: [id: string] }>()

const columns = computed<ScoreboardColumn<ScoreRow>[]>(() => [
  {
    key: 'ratio',
    label: 'Anteil',
    fact: formatPercent(props.targetRatio),
    width: '3.5rem',
    align: 'end',
    numeric: true,
  },
  {
    key: 'difference',
    label: 'Differenz',
    ...(props.tolerance === null ? {} : { fact: `± ${formatPercent(props.tolerance)}` }),
    width: '4rem',
    align: 'end',
    numeric: true,
  },
])

/**
 * The Kollektiv row lines up with the table above by the same widths, gutters and — when any row
 * has one — the clock column. „Name“ takes what the others leave over; „Pkt“ is 2rem as there.
 */
const kollektivColumns = computed(() =>
  [
    'minmax(0, 1fr)',
    ...columns.value.map((column) => column.width),
    ...(hasDurations(props.rows) ? ['3.5rem'] : []),
    '2rem',
  ].join(' '),
)

const BUTTON = 'cursor-pointer text-start focus-visible:outline-2 focus-visible:-outline-offset-2'

const still = isStill(props.animate)
const { shown } = useRevealArming(still)
</script>

<template>
  <div class="flex flex-col gap-2">
    <RevealScoreboard
      :rows="props.rows"
      :columns="columns"
      caption="Alle Gemälde der Runde, nach Abweichung sortiert"
      :live="props.live"
      :animate="props.animate"
    >
      <template #name="{ row }">
        <button
          v-if="row.strokes !== null"
          type="button"
          :data-test="`select-${row.userId}`"
          :class="BUTTON"
          class="flex w-full"
          :aria-pressed="props.selected.includes(row.userId)"
          @click="emit('select', row.userId)"
        >
          <span
            class="min-w-0 truncate"
            :class="props.selected.includes(row.userId) ? 'font-semibold underline' : ''"
            >{{ row.name }}</span
          >
        </button>
        <template v-else>{{ row.name }}</template>
      </template>

      <!-- Small: „+12,3 %“ must fit the narrow columns that leave the name its room. -->
      <template #cell-ratio="{ row }">
        <span class="text-sm">{{ row.ratioLabel ?? '—' }}</span>
      </template>
      <template #cell-difference="{ row }">
        <span class="text-sm">{{ row.differenceLabel ?? '—' }}</span>
      </template>
    </RevealScoreboard>

    <hr class="border-neutral-300" />

    <!-- Appears with the head, when the solution does: it names the target. -->
    <div
      data-test="paint-ratio-kollektiv"
      class="grid gap-x-1 text-sm text-neutral-900 transition-opacity"
      :class="shown ? 'opacity-100' : 'opacity-0'"
      :style="{
        gridTemplateColumns: kollektivColumns,
        transitionDuration: `${FADE_MS}ms`,
        transitionDelay: `${headCellDelayMs(0, 0)}ms`,
      }"
    >
      <!-- The label wraps rather than truncates: it is no player's name, and it is always there. -->
      <button
        type="button"
        data-test="select-kollektiv"
        :class="BUTTON"
        class="min-w-0 bg-neutral-200 px-0.5"
        :aria-pressed="props.selected.includes(KOLLEKTIV)"
        @click="emit('select', KOLLEKTIV)"
      >
        <span :class="props.selected.includes(KOLLEKTIV) ? 'font-semibold underline' : ''"
          >Kollektiv Kommune</span
        >
      </button>
      <span class="flex items-center justify-end bg-neutral-200 px-0.5 tabular-nums">{{
        formatPercent(props.targetRatio)
      }}</span>
      <span class="flex items-center justify-end bg-neutral-200 px-0.5 tabular-nums">{{
        formatDifference(0)
      }}</span>
      <span
        v-if="hasDurations(props.rows)"
        class="flex items-center justify-end bg-neutral-200 px-0.5 font-mono text-xs"
        >—</span
      >
      <span class="flex items-center justify-end bg-neutral-200 px-px tabular-nums">—</span>
    </div>
  </div>
</template>
