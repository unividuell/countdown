<script setup lang="ts">
/**
 * „Auswertung“ for Entstauber. The table is `RevealScoreboard`; this file decides the three columns
 * and the name cell — a button, because the rows are the curve's legend: tapping one brings that
 * player's line forward.
 */
import { computed } from 'vue'
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import type { ScoreboardColumn } from '@/games/scoreboardColumns'
import type { DedusterRow } from './scoreboard'

const props = defineProps<{
  rows: DedusterRow[]
  live: boolean
  animate: boolean
  selectedUserId: string | null
}>()

const emit = defineEmits<{ select: [userId: string] }>()

const columns = computed<ScoreboardColumn<DedusterRow>[]>(() => [
  { key: 'avg', label: '⌀ ms', width: '3.5rem', align: 'end', numeric: true },
  { key: 'level', label: 'Level', width: '3.5rem', align: 'end', numeric: true },
  { key: 'out', label: 'raus', width: '5.5rem' },
])
</script>

<template>
  <RevealScoreboard
    :rows="props.rows"
    :columns="columns"
    caption="Alle Läufe der Runde, nach Punkten sortiert"
    :live="props.live"
    :animate="props.animate"
  >
    <template #name="{ row }">
      <button
        type="button"
        :data-test="`select-${row.userId}`"
        class="w-full cursor-pointer truncate text-start focus-visible:outline-2 focus-visible:-outline-offset-2"
        :class="props.selectedUserId === row.userId ? 'font-semibold underline' : ''"
        :aria-pressed="props.selectedUserId === row.userId"
        @click="emit('select', row.userId)"
      >
        {{ row.name }}
      </button>
    </template>

    <template #cell-avg="{ row }">{{ row.averageLabel }}</template>
    <template #cell-level="{ row }">{{ row.levelLabel }}</template>
    <template #cell-out="{ row }">
      <span>{{ row.out ?? '—' }}</span>
      <span
        v-if="row.implausible"
        :data-test="`mark-implausible-${row.userId}`"
        class="ms-1"
        title="unplausible Reaktionszeit"
        >⚠<span class="sr-only"> unplausible Reaktionszeit</span></span
      >
      <span
        v-if="row.restarted"
        :data-test="`mark-restarted-${row.userId}`"
        class="ms-1"
        title="nach dem Neuladen gespielt"
        >↻<span class="sr-only"> nach dem Neuladen gespielt</span></span
      >
    </template>
  </RevealScoreboard>
</template>
