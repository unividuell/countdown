<script setup lang="ts">
/**
 * „Auswertung“ for Anmaßung: every painting of the round, nearest to the target first.
 *
 * The table is `RevealScoreboard`; this file adds what stands between „Name“ and „Pkt“ — the
 * painted share and its difference — and what makes the names more than names: each is a button
 * that lays that painting on the canvas. Beneath the table, set apart, the Kollektiv Kommune is
 * the last row, and its button switches the picture itself.
 *
 *                        Lösung*  Toleranz
 *   Auswertung             43,3     ± 1,0
 *   Name                 Anteil*  Differenz   Pkt
 *                           [%]        [%]
 *   anna                   41,0      -2,3      1
 *   ─────────────────────────────────────────────
 *   Kollektiv Kommune      43,3       0,0      —
 *                  * Anteil Farbe auf Leinwand
 */
import { computed } from 'vue'
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import { FADE_MS } from '@/games/revealChoreography'
import { useRevealTimeline } from '@/games/revealTimeline'
import type { ScoreboardColumn } from '@/games/scoreboardColumns'
import { KOLLEKTIV } from './layers'
import { formatDifference, formatShare } from './scoreboard'
import type { ScoreRow } from './scoreboard'

const props = defineProps<{
  rows: ScoreRow[]
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
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
    label: 'Anteil*',
    unit: '%',
    fact: 'Lösung*',
    width: '3.5rem',
    align: 'end',
    numeric: true,
  },
  {
    key: 'difference',
    label: 'Differenz',
    unit: '%',
    ...(props.tolerance === null ? {} : { fact: 'Toleranz' }),
    width: '4rem',
    align: 'end',
    numeric: true,
  },
])

/** The Kollektiv's cells: it painted the target itself, so it is off by nothing. */
function kollektivCell(key: string): string {
  if (key === 'ratio') return formatShare(props.targetRatio)
  if (key === 'difference') return formatDifference(0)
  return '—'
}

const BUTTON = 'cursor-pointer text-start focus-visible:outline-2 focus-visible:-outline-offset-2'

/** The head's values are the Kollektiv's, so they wear its row's ground, right-aligned like the column. */
const FACT = 'block bg-surface-container-highest px-0.5 text-end text-on-surface tabular-nums'

/** The Kollektiv names the target: it judges, so it lands on the verdict. */
const shown = useRevealTimeline().reached('verdict')
</script>

<template>
  <div class="flex flex-col gap-2">
    <RevealScoreboard
      :rows="props.rows"
      :columns="columns"
      caption="Alle Gemälde der Runde, nach Abweichung sortiert"
      :live="props.live"
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

      <template #fact-ratio>
        <span data-test="paint-ratio-solution" :class="FACT">{{
          formatShare(props.targetRatio)
        }}</span>
      </template>
      <template v-if="props.tolerance !== null" #fact-difference>
        <span data-test="paint-ratio-tolerance" :class="FACT"
          >± {{ formatShare(props.tolerance) }}</span
        >
      </template>

      <template #cell-ratio="{ row }">{{ row.ratioLabel ?? '—' }}</template>
      <template #cell-difference="{ row }">{{ row.differenceLabel ?? '—' }}</template>

      <!-- The Kollektiv: a row of the table, set apart by a rule, above the units. It appears with
           the verdict: it names the target. -->
      <template #foot="{ columns: footColumns }">
        <tr aria-hidden="true">
          <td :colspan="footColumns.length + 2" class="py-1"><hr class="border-outline" /></td>
        </tr>
        <tr
          data-test="paint-ratio-kollektiv"
          class="text-on-surface transition-opacity"
          :class="shown ? 'opacity-100' : 'opacity-0'"
          :style="{
            transitionDuration: `${FADE_MS}ms`,
            transitionDelay: '0ms',
          }"
        >
          <!-- The label wraps rather than truncates: it is no player's name, and it is always there. -->
          <th scope="row" class="bg-surface-container-highest px-0.5 text-start font-normal">
            <button
              type="button"
              data-test="select-kollektiv"
              :class="BUTTON"
              class="w-full"
              :aria-pressed="props.selected.includes(KOLLEKTIV)"
              @click="emit('select', KOLLEKTIV)"
            >
              <span :class="props.selected.includes(KOLLEKTIV) ? 'font-semibold underline' : ''"
                >Kollektiv Kommune</span
              >
            </button>
          </th>
          <td
            v-for="column in footColumns"
            :key="column.key"
            class="bg-surface-container-highest px-0.5 text-end"
            :class="column.key === 'clock' ? 'font-mono text-xs' : 'tabular-nums'"
          >
            {{ kollektivCell(column.key) }}
          </td>
          <td class="bg-surface-container-highest px-px text-end tabular-nums">—</td>
        </tr>
      </template>
    </RevealScoreboard>

    <p data-test="paint-ratio-legend" class="text-end text-xs text-on-surface-variant">
      * Anteil Farbe auf Leinwand
    </p>
  </div>
</template>
