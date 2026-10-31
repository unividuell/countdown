<script setup lang="ts">
/**
 * „Auswertung“ for Peilung: every pin of the round, nearest to the clips first.
 *
 * The table is `RevealScoreboard`; this file adds what stands between „Name“ and „Pkt“ — the
 * distance — and makes each name a button that lights that player's pings, rings and pins on
 * the map above.
 *
 *   Auswertung
 *   Name               Abstand     Pkt
 *   anna                 1,6        1
 *   bert               Ø 7,2        0      two clips: the mean
 */
import { computed } from 'vue'
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import type { ScoreboardColumn } from '@/games/scoreboardColumns'
import type { ScoreRow } from './scoreboard'

const props = defineProps<{
  rows: ScoreRow[]
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** False when this card was already the reveal on arrival: a reload shows the finished table. */
  animate: boolean
  /** The player whose pings are on the map. */
  selected: string | null
}>()

const emit = defineEmits<{ select: [userId: string] }>()

const columns = computed<ScoreboardColumn<ScoreRow>[]>(() => [
  {
    key: 'distance',
    label: 'Abstand',
    width: '4rem',
    align: 'end',
    numeric: true,
  },
])

const BUTTON = 'cursor-pointer text-start focus-visible:outline-2 focus-visible:-outline-offset-2'
</script>

<template>
  <RevealScoreboard
    :rows="props.rows"
    :columns="columns"
    caption="Alle Peilungen der Runde, nach Abstand sortiert"
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

    <template #cell-distance="{ row }">{{ row.distanceLabel ?? '—' }}</template>
  </RevealScoreboard>
</template>
