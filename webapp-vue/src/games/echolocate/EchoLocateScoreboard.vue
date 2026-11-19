<script setup lang="ts">
/**
 * „Auswertung“ for Peilung: every pin of the round, nearest to the clips first.
 *
 * The table is `RevealScoreboard`; this file adds what stands between „Name“ and „Pkt“ — the
 * distance and the pings — and makes each name a button that lights that player's pings, rings and
 * pins on the map above.
 *
 *                      Toleranz
 *                         ≤ 1,5            phase one only: the circle's radius; a distance is never negative
 *   Auswertung
 *   Name               Abstand  Pings  Pkt
 *   anna                 1,6      4     1
 *   bert               Ø 7,2     12     0  two clips: the mean
 *
 * Phase two ranks by distance + 0.1 per ping, one column whose cell is its own bar:
 *
 *   Name     Abstand + Pings*                    Pkt
 *   bert     ████▒▒ 1,2 + 4 × 0,1 = 1,6       3   ██ distance, ▒▒ the pings' cost,
 *   anna     █▒▒▒▒▒▒▒▒▒▒▒ 0,4 + 30 × 0,1 = 3,4    both against the round's longest
 *            * Abstand + Pings × 0,1 – die kleinste Summe gewinnt
 */
import { computed } from 'vue'
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import type { ScoreboardColumn } from '@/games/scoreboardColumns'
import { formatPingCost } from './scoreboard'
import type { ScoreRow } from './scoreboard'

const props = defineProps<{
  rows: ScoreRow[]
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** False when this card was already the reveal on arrival: a reload shows the finished table. */
  animate: boolean
  /** The player whose pings are on the map. */
  selected: string | null
  /** The tolerance circle's radius; `null` in phase two, where there is no gate. */
  toleranceRadius: number | null
  /** Phase two's cells per ping; `null` where pings cost nothing, and then no legend explains them. */
  pingCost: number | null
}>()

const emit = defineEmits<{ select: [userId: string] }>()

const oneDecimal = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const phaseTwo = computed(() => props.toleranceRadius === null)

const columns = computed<ScoreboardColumn<ScoreRow>[]>(() =>
  phaseTwo.value
    ? [
        // Bare: the cell paints its own bar.
        {
          key: 'score',
          // The star points at the legend under the table.
          label: props.pingCost === null ? 'Abstand + Pings' : 'Abstand + Pings*',
          // A far miss, „Ø 12,4 + 30 × 0,1 = 15,4“, is 157 px in text-sm; the name keeps what is
          // left, 143 px on a 375 px phone.
          width: '10rem',
          align: 'start',
          numeric: true,
          ground: () => null,
        },
      ]
    : [
        {
          key: 'distance',
          label: 'Abstand',
          fact: 'Toleranz',
          width: '4rem',
          align: 'end',
          numeric: true,
        },
        { key: 'pings', label: 'Pings', width: '3.5rem', align: 'end', numeric: true },
      ],
)

/** `47.5%`: a bar's edge, rounded so a float's tail never reaches the style. */
function percent(fraction: number): string {
  return `${Math.round(fraction * 1000) / 10}%`
}

/** The bar's two edges; the gradient in the template paints between them. */
function barStyle(bar: NonNullable<ScoreRow['bar']>, colorHex: string): Record<string, string> {
  return {
    '--bar-distance': percent(bar.distance),
    '--bar-pings': percent(bar.distance + bar.pings),
    '--bar-color': colorHex,
  }
}

const BUTTON = 'cursor-pointer text-start focus-visible:outline-2 focus-visible:-outline-offset-2'
</script>

<template>
  <div class="flex flex-col gap-1">
    <RevealScoreboard
      :rows="props.rows"
      :columns="columns"
      :caption="
        phaseTwo
          ? 'Alle Peilungen der Runde, nach Abstand und Pings sortiert'
          : 'Alle Peilungen der Runde, nach Abstand sortiert'
      "
      :live="props.live"
      :animate="props.animate"
    >
      <!-- A row without a guess has no pings to show: a give-up, or a play that cannot be read. -->
      <template #name="{ row }">
        <button
          v-if="row.guess !== null"
          type="button"
          :data-test="`select-${row.userId}`"
          :class="BUTTON"
          class="flex w-full"
          :aria-pressed="props.selected === row.userId"
          @click="emit('select', row.userId)"
        >
          <span
            class="min-w-0 truncate"
            :class="props.selected === row.userId ? 'font-semibold underline' : ''"
            >{{ row.name }}</span
          >
        </button>
        <template v-else>{{ row.name }}</template>
      </template>

      <template v-if="props.toleranceRadius !== null" #fact-distance>
        <span data-test="distance-tolerance" class="block text-end tabular-nums">
          ≤&nbsp;{{ oneDecimal.format(props.toleranceRadius) }}
        </span>
      </template>
      <template #cell-distance="{ row }">{{ row.distanceLabel ?? '—' }}</template>
      <template #cell-pings="{ row }">{{ row.pingCount ?? '—' }}</template>
      <!-- A round judged before pings cost anything has no bar: its distance stands alone. -->
      <template #cell-score="{ row }">
        <div
          v-if="row.bar !== null"
          :data-test="`score-bar-${row.userId}`"
          class="px-0.5 text-sm leading-6 whitespace-nowrap"
          :style="barStyle(row.bar, row.colorHex)"
          style="
            background: linear-gradient(
              to right,
              color-mix(in srgb, var(--bar-color) 55%, transparent) 0 var(--bar-distance),
              color-mix(in srgb, var(--bar-color) 22%, transparent) var(--bar-distance)
                var(--bar-pings),
              transparent var(--bar-pings)
            );
          "
        >
          {{ row.scoreLabel }}
        </div>
        <div v-else class="px-0.5">{{ row.distanceLabel ?? '—' }}</div>
      </template>
    </RevealScoreboard>

    <p
      v-if="phaseTwo && props.pingCost !== null"
      data-test="echo-locate-score-legend"
      class="text-end text-xs text-on-surface-variant"
    >
      * Abstand + Pings × {{ formatPingCost(props.pingCost) }} – die kleinste Summe gewinnt
    </p>
  </div>
</template>
