<script setup lang="ts">
/**
 * „Auswertung“ for Augenmaß: the shared table with the tip and its signed distance from the
 * truth. The name is a button — tapping it lays that player's outline over the reveal's field.
 */
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import type { ScoreboardColumn } from '@/games/scoreboardColumns'
import type { ScoreboardRow } from './scoreboard'

const props = defineProps<{
  rows: ScoreboardRow[]
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** False when this card was already the reveal on arrival: a reload shows the finished table. */
  animate: boolean
  selectedUserId: string | null
}>()

const emit = defineEmits<{ select: [userId: string] }>()

const COLUMNS: ScoreboardColumn<ScoreboardRow>[] = [
  { key: 'tip', label: 'Tipp', width: '3.5rem', align: 'end', numeric: true },
  { key: 'off', label: 'Abstand', width: '4rem', align: 'end', numeric: true },
]
</script>

<template>
  <RevealScoreboard
    :rows="props.rows"
    :columns="COLUMNS"
    caption="Alle Tipps der Runde, nach Punkten sortiert"
    :live="props.live"
    :animate="props.animate"
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
    <template #cell-tip="{ row }">{{ row.tip }}</template>
    <template #cell-off="{ row }">{{ row.off }}</template>
  </RevealScoreboard>
</template>
