<script setup lang="ts">
/**
 * „Auswertung“ for Peilung: every pin of the round, nearest to the clips first; in phase two on
 * the clock, which the table adds itself.
 *
 * The table is `RevealScoreboard`; this file adds what stands between „Name“ and „Pkt“ — the
 * distance and the pings — and makes each name a button that lights that player's pings, rings and
 * pins on the map above.
 *
 *                      Toleranz
 *                         ≤ 1,5            the circle's radius; a distance is never negative
 *   Auswertung
 *   Name              Pings  Abstand  Pkt   phase two: Zeit [mm:ss] between Abstand and Pkt
 *   anna                 4      1,6     1
 *   bert                12    Ø 7,2     0   two clips: the mean
 */
import { computed } from 'vue'
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import type { ScoreboardColumn } from '@/games/scoreboardColumns'
import type { ScoreRow } from './scoreboard'

const props = defineProps<{
  rows: ScoreRow[]
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** The player whose pings are on the map. */
  selected: string | null
  /** The tolerance circle's radius; `null` in phase two, where there is no gate. */
  toleranceRadius: number | null
}>()

const emit = defineEmits<{ select: [userId: string] }>()

const oneDecimal = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

// What decides stands furthest right, next to „Pkt“: the distance; in phase two the frame's clock
// comes after it, as in every timed scoreboard.
const columns = computed<ScoreboardColumn<ScoreRow>[]>(() => [
  { key: 'pings', label: 'Pings', width: '3rem', align: 'end', numeric: true },
  {
    key: 'distance',
    label: 'Abstand',
    ...(props.toleranceRadius === null ? {} : { fact: 'Toleranz' }),
    width: '3.5rem',
    align: 'end',
    numeric: true,
  },
])

/** Only a timed round's rows carry a clock. */
const timed = computed(() => props.rows.some((row) => row.durationLabel != null))

const BUTTON = 'cursor-pointer text-start focus-visible:outline-2 focus-visible:-outline-offset-2'
</script>

<template>
  <RevealScoreboard
    :rows="props.rows"
    :columns="columns"
    :caption="
      timed
        ? 'Alle Peilungen der Runde, Treffer nach Zeit sortiert'
        : 'Alle Peilungen der Runde, nach Abstand sortiert'
    "
    :live="props.live"
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
  </RevealScoreboard>
</template>
