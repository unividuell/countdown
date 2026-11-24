<script setup lang="ts">
/**
 * „Auswertung“ for Anrührung: the shared table with each mix as five pigment boxes under the
 * target's and the distance to the target colour. The name is a button — tapping it toggles that
 * player's mix in the reveal's circle. The boxes bring their own surface, so the table leaves that
 * cell bare.
 *
 *                    Ziel            Toleranz
 *                    [█][ ][▌][ ][ ]   ≤ 4,0
 *   Name             Tropfen         Abstand   Pkt
 *   anna             [▌][ ][▌][ ][ ]     3,2     1
 */
import { computed } from 'vue'
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import type { ScoreboardColumn } from '@/games/scoreboardColumns'
import RecipeBoxes from './RecipeBoxes.vue'
import { toleranceText, type ScoreboardRow } from './scoreboard'
import type { MixColorPigment, Recipe } from './types'

const props = defineProps<{
  rows: ScoreboardRow[]
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** Whose mixes are on show. */
  selected: string[]
  /** `null` in phase two — there is no gate there. */
  tolerance: number | null
  pigments: MixColorPigment[]
  target: Recipe
}>()

const emit = defineEmits<{ select: [userId: string] }>()

const columns = computed<ScoreboardColumn<ScoreboardRow>[]>(() => [
  // Exactly the boxes: `size-5` each, `gap-px` between.
  {
    key: 'drops',
    label: 'Tropfen',
    fact: 'Ziel',
    width: `calc(${props.pigments.length} * 1.25rem + ${Math.max(props.pigments.length - 1, 0)} * 1px)`,
    ground: () => null,
  },
  {
    key: 'off',
    label: 'Abstand',
    ...(props.tolerance === null ? {} : { fact: 'Toleranz' }),
    width: '3.75rem',
    align: 'end',
    numeric: true,
  },
])

/** The largest single count in the table, target included: the scale every box fills against. */
const max = computed(() =>
  Math.max(
    1,
    ...Object.values(props.target),
    ...props.rows.flatMap((row) => (row.recipe === null ? [] : Object.values(row.recipe))),
  ),
)

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
        :aria-pressed="props.selected.includes(row.userId)"
        @click="emit('select', row.userId)"
      >
        <span
          class="min-w-0 truncate"
          :class="props.selected.includes(row.userId) ? 'font-semibold underline' : ''"
          >{{ row.name }}</span
        >
      </button>
    </template>

    <template #fact-drops>
      <RecipeBoxes
        data-test="mix-color-target"
        :pigments="props.pigments"
        :recipe="props.target"
        :max="max"
      />
    </template>

    <template v-if="props.tolerance !== null" #fact-off>
      <span data-test="mix-color-tolerance" :class="FACT">{{
        toleranceText(props.tolerance)
      }}</span>
    </template>

    <template #cell-drops="{ row }">
      <RecipeBoxes
        v-if="row.recipe !== null"
        :data-test="`mix-${row.userId}`"
        :pigments="props.pigments"
        :recipe="row.recipe"
        :max="max"
      />
      <span v-else class="block text-center">–</span>
    </template>
    <template #cell-off="{ row }">{{ row.off }}</template>
  </RevealScoreboard>
</template>
