<script setup lang="ts">
/**
 * „Auswertung“ for Musterung: every player's tip as a row, in the order the round already ranked
 * them.
 *
 * The table itself is `RevealScoreboard`; what this file decides is the tip column. Its chips are a
 * *pattern*, not a row of cells — they sit tight against each other and against the cell's edge —
 * so the column brings its own surface and the table leaves the cell bare. Each chip carries its
 * own `ink`, because the board's four greys are close enough that one fixed colour would be
 * unreadable on at least one of them.
 */
import { computed } from 'vue'
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import type { ScoreboardColumn } from '@/games/scoreboardColumns'
import { hasDurations } from './scoreboard'
import type { ScoreRow, ToneChip } from './scoreboard'

const props = defineProps<{
  rows: ScoreRow[]
  solutionChips: ToneChip[]
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** False when this card was already the reveal on arrival: a reload shows the finished table. */
  animate: boolean
}>()

const timed = computed(() => hasDurations(props.rows))

/**
 * Exactly as wide as the chips it holds — `size-6` (`1.5rem`) each, `gap-px` (`1px`) between —
 * instead of a fixed width that would leave slack for the „Lösung“/„Tipp“ bands to run past the
 * chips. Derived from `solutionChips`, never a player's row: a give-up row has none, and the
 * solution always carries the full pattern length, so this follows `PATTERN_LENGTH` wherever it
 * goes.
 */
const tipColumnWidth = computed(() => {
  const count = props.solutionChips.length
  return `calc(${count} * 1.5rem + ${Math.max(count - 1, 0)} * 1px)`
})

const columns = computed<ScoreboardColumn<ScoreRow>[]>(() => [
  { key: 'tip', label: 'Tipp', width: tipColumnWidth.value, ground: () => null },
  ...(timed.value
    ? [{ key: 'clock', label: '[mm:ss]', width: '3.5rem', align: 'end' as const }]
    : []),
])
</script>

<template>
  <RevealScoreboard
    :rows="props.rows"
    :columns="columns"
    solution-column="tip"
    caption="Alle Tipps der Runde, nach Punkten sortiert"
    :live="props.live"
    :animate="props.animate"
  >
    <template #solution>
      <div class="flex flex-row gap-px">
        <span
          v-for="chip in props.solutionChips"
          :key="chip.value"
          data-test="solution-chip"
          class="size-6 content-center text-center font-mono text-xs"
          :style="{ backgroundColor: chip.hex, color: chip.ink }"
        >
          {{ chip.value }}
        </span>
      </div>
    </template>

    <template #cell-tip="{ row }">
      <div v-if="!row.gaveUp" :data-test="`tip-${row.userId}`" class="flex flex-row gap-px">
        <span
          v-for="(chip, at) in row.chips"
          :key="at"
          class="size-6 content-center text-center font-mono text-xs"
          :style="{ backgroundColor: chip.hex, color: chip.ink }"
        >
          {{ chip.value }}
        </span>
      </div>
      <div
        v-else
        :data-test="`tip-${row.userId}`"
        class="bg-neutral-900 px-1 text-center text-xs text-neutral-50"
      >
        aufgegeben
      </div>
    </template>

    <template #cell-clock="{ row }">
      <span class="font-mono text-xs">{{ row.durationLabel ?? '—' }}</span>
    </template>
  </RevealScoreboard>
</template>
