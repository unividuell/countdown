<script setup lang="ts">
/**
 * „Auswertung“ for Anrührung: the shared table with the drops used and the distance to the target
 * colour. The name is a button — tapping it shows that player's mix on the reveal.
 *
 *                              Toleranz
 *   Name             Tropfen   Abstand   Pkt
 *   anna                   7       3,2     1
 */
import { computed } from 'vue'
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import type { ScoreboardColumn } from '@/games/scoreboardColumns'
import { toleranceText, type ScoreboardRow } from './scoreboard'

const props = defineProps<{
  rows: ScoreboardRow[]
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** Whose mix is on show. */
  selected: string | null
  /** `null` in phase two — there is no gate there. */
  tolerance: number | null
}>()

const emit = defineEmits<{ select: [userId: string] }>()

const columns = computed<ScoreboardColumn<ScoreboardRow>[]>(() => [
  { key: 'drops', label: 'Tropfen', width: '3.75rem', align: 'end', numeric: true },
  {
    key: 'off',
    label: 'Abstand',
    ...(props.tolerance === null ? {} : { fact: 'Toleranz' }),
    width: '3.75rem',
    align: 'end',
    numeric: true,
  },
])

const FACT = 'block bg-surface-container-highest px-0.5 text-end text-on-surface tabular-nums'
</script>

<template>
  <RevealScoreboard
    :rows="props.rows"
    :columns="columns"
    caption="Alle Mischungen der Runde, nach Punkten sortiert"
    :live="props.live"
  >
    <template #name="{ row }">
      <button
        type="button"
        :data-test="`select-${row.userId}`"
        class="flex w-full cursor-pointer items-baseline gap-1 text-start focus-visible:outline-2 focus-visible:-outline-offset-2"
        :aria-pressed="props.selected === row.userId"
        @click="emit('select', row.userId)"
      >
        <span
          class="min-w-0 truncate"
          :class="props.selected === row.userId ? 'font-semibold underline' : ''"
          >{{ row.name }}</span
        >
      </button>
    </template>

    <template v-if="props.tolerance !== null" #fact-off>
      <span data-test="mix-color-tolerance" :class="FACT">{{
        toleranceText(props.tolerance)
      }}</span>
    </template>

    <template #cell-drops="{ row }">{{ row.drops }}</template>
    <template #cell-off="{ row }">{{ row.off }}</template>
  </RevealScoreboard>
</template>
