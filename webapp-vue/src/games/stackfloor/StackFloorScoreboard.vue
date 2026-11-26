<script setup lang="ts">
/**
 * „Auswertung“ for Hochstapler: the shared table with one column, the tower's height. The name is a
 * button — tapping it shows that player's tower on the reveal's board. In phase one the head names
 * what earned the point: „Lösung ≥ 12“.
 */
import { computed } from 'vue'
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import type { ScoreboardColumn } from '@/games/scoreboardColumns'
import type { ScoreRow } from './scoreboard'
import StackFloorMark from './StackFloorMark.vue'

const props = defineProps<{
  rows: ScoreRow[]
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  selectedUserId: string | null
  /** The floor that earned the point; `null` in phase two. */
  target: number | null
}>()

const emit = defineEmits<{ select: [userId: string] }>()

const solution = computed(() => (props.target === null ? null : `≥ ${props.target}`))

/** As wide as the widest text, one `ch` spare, but never narrower than „Höhe“ in the head. */
const columns = computed<ScoreboardColumn<ScoreRow>[]>(() => {
  const texts = [solution.value ?? '', ...props.rows.map((row) => String(row.height ?? '—'))]
  const ch = Math.max(...texts.map((text) => text.length)) + 1

  return [
    {
      key: 'height',
      label: 'Höhe',
      width: `max(calc(${ch}ch + 0.25rem), 2.05rem)`,
      align: 'end',
      numeric: true,
      ...(solution.value === null ? {} : { fact: 'Lösung' }),
    },
  ]
})

/** Like Augenmaß's head values: the solution row's ground, right-aligned like the column. */
const FACT = 'block bg-surface-container-highest px-0.5 text-end text-on-surface tabular-nums'
</script>

<template>
  <RevealScoreboard
    :rows="props.rows"
    :columns="columns"
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

    <template v-if="solution !== null" #fact-height>
      <span data-test="stack-floor-solution" :class="FACT">{{ solution }}</span>
    </template>

    <template #cell-height="{ row }">{{ row.height === null ? '—' : String(row.height) }}</template>
  </RevealScoreboard>
</template>
