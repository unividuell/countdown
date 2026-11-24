<script setup lang="ts">
/**
 * Target against player, drop by drop: per pigment a target lane over a player lane, one grid
 * column per drop up to the glass's capacity.
 *
 *   Cyan   Ziel  ●●●○○○
 *          Mix   ●●○○○○
 *   Gelb   Mix   ●○○○○○      (absent from the target: its lane is empty)
 *
 * Pigments absent from both recipes are skipped. Without a player recipe there is no player lane.
 */
import { computed } from 'vue'
import type { MixColorPigment, Recipe } from './types'

const props = defineProps<{
  pigments: MixColorPigment[]
  target: Recipe
  player: Recipe | null
  capacity: number
}>()

/** Payload order, so the same pigment sits in the same place every round. */
const rows = computed(() =>
  props.pigments
    .filter(
      (pigment) => (props.target[pigment.key] ?? 0) > 0 || (props.player?.[pigment.key] ?? 0) > 0,
    )
    .map((pigment) => ({
      pigment,
      lanes: [
        { id: 'target', label: 'Ziel', drops: props.target[pigment.key] ?? 0 },
        ...(props.player === null
          ? []
          : [{ id: 'player', label: 'Mix', drops: props.player[pigment.key] ?? 0 }]),
      ],
    })),
)

const columns = computed(() => ({
  gridTemplateColumns: `repeat(${props.capacity}, minmax(0, 1fr))`,
}))
</script>

<template>
  <div data-test="drop-bars" class="flex flex-col gap-3">
    <div v-for="row in rows" :key="row.pigment.key" class="flex flex-col gap-1">
      <span class="text-xs text-on-surface-variant">{{ row.pigment.name }}</span>

      <div
        v-for="lane in row.lanes"
        :key="lane.id"
        :data-test="`lane-${row.pigment.key}-${lane.id}`"
        role="img"
        :aria-label="`${row.pigment.name}, ${lane.label}: ${lane.drops} Tropfen`"
        class="flex items-center gap-2"
      >
        <span class="w-8 shrink-0 text-xs text-on-surface-variant">{{ lane.label }}</span>

        <div class="grid min-w-0 flex-1 gap-px" :style="columns">
          <span
            v-for="n in props.capacity"
            :key="n"
            aria-hidden="true"
            :data-test="n <= lane.drops ? 'drop' : undefined"
            class="aspect-square rounded-full"
            :class="n <= lane.drops ? 'border border-outline' : 'bg-surface-container-highest'"
            :style="n <= lane.drops ? { backgroundColor: row.pigment.hex } : undefined"
          />
        </div>
      </div>
    </div>
  </div>
</template>
