<script setup lang="ts">
/**
 * „Auswertung“ for Hochstapler: the shared table with one column, the tower's height. The name is a
 * button — tapping it shows that player's tower on the reveal's board.
 */
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import type { ScoreboardColumn } from '@/games/scoreboardColumns'
import type { ScoreRow } from './scoreboard'
import StackFloorMark from './StackFloorMark.vue'

const props = defineProps<{
  rows: ScoreRow[]
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  selectedUserId: string | null
}>()

const emit = defineEmits<{ select: [userId: string] }>()

const COLUMNS: ScoreboardColumn<ScoreRow>[] = [{ key: 'height', label: 'Höhe', width: '6.5rem' }]
</script>

<template>
  <RevealScoreboard
    :rows="props.rows"
    :columns="COLUMNS"
    caption="Alle Türme der Runde, nach Punkten sortiert"
    :live="props.live"
  >
    <!-- The marks follow the name and never shrink: a long name truncates, the mark stays. -->
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
        <StackFloorMark
          v-for="mark in row.marks"
          :key="mark"
          :data-test="`mark-${mark}-${row.userId}`"
          :mark="mark"
        />
      </button>
    </template>

    <template #cell-height="{ row }">{{ row.height === null ? '—' : String(row.height) }}</template>
  </RevealScoreboard>
</template>
