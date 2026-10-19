<script setup lang="ts">
/**
 * „Auswertung“ for Blockierung: the shared table — K/D right behind the name, the clock when the
 * round was timed. The name is a button — tapping it shows that player's tip in the reveal's view.
 * The star on „K/D“ points at the legend beneath the table.
 */
import { computed } from 'vue'
import { hasDurations } from '@/games/durations'
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import type { ScoreboardColumn } from '@/games/scoreboardColumns'
import type { ScoreRow } from './scoreboard'

const props = defineProps<{
  rows: ScoreRow[]
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** False when this card was already the reveal on arrival: a reload shows the finished table. */
  animate: boolean
  selectedUserId: string | null
}>()

const emit = defineEmits<{ select: [userId: string] }>()

const columns = computed<ScoreboardColumn<ScoreRow>[]>(() => [
  { key: 'kd', label: 'K/D*', width: '3.5rem', align: 'end' },
  ...(hasDurations(props.rows)
    ? [{ key: 'clock', label: '[mm:ss]', width: '3.5rem', align: 'end' as const }]
    : []),
])
</script>

<template>
  <div class="flex flex-col gap-1">
    <RevealScoreboard
      :rows="props.rows"
      :columns="columns"
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

      <template #cell-kd="{ row }">
        <span class="font-mono text-xs">{{ row.kdLabel ?? '—' }}</span>
      </template>

      <template #cell-clock="{ row }">
        <span class="font-mono text-xs">{{ row.durationLabel ?? '—' }}</span>
      </template>
    </RevealScoreboard>

    <p data-test="copy-blocks-kd-legend" class="text-end text-xs text-neutral-600">
      * K korrekt · D daneben (fehlend, zu viel, falscher Typ)
    </p>
  </div>
</template>
