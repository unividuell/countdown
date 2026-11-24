<script setup lang="ts">
/**
 * Target against player, drop by drop: one row per pigment, one grid column per drop up to the
 * glass's capacity. Each circle is split: the upper half counts the player's drops, the lower
 * half the target's.
 *
 *   Mix 3, Ziel 2   ●●◓○○○      ● both halves · ◓ upper only · ○ empty
 *
 * Every pigment gets its row, empty or not, in payload order; each circle is ringed in its pigment,
 * so an empty row still tells whose it is. Without a player recipe the upper halves stay empty.
 */
import { computed } from 'vue'
import type { MixColorPigment, Recipe } from './types'

const props = defineProps<{
  pigments: MixColorPigment[]
  target: Recipe
  player: Recipe | null
  capacity: number
}>()

const rows = computed(() =>
  props.pigments.map((pigment) => {
    const target = props.target[pigment.key] ?? 0
    const player = props.player === null ? null : (props.player[pigment.key] ?? 0)

    return {
      pigment,
      target,
      player: player ?? 0,
      label:
        player === null
          ? `${pigment.name}, Ziel: ${target} Tropfen`
          : `${pigment.name}: Mix ${player}, Ziel ${target} Tropfen`,
    }
  }),
)

const columns = computed(() => ({
  gridTemplateColumns: `repeat(${props.capacity}, minmax(0, 1fr))`,
}))
</script>

<template>
  <div data-test="drop-bars" class="flex flex-col gap-2">
    <div
      v-for="row in rows"
      :key="row.pigment.key"
      :data-test="`row-${row.pigment.key}`"
      role="img"
      :aria-label="row.label"
      class="grid gap-px"
      :style="columns"
    >
      <span
        v-for="n in props.capacity"
        :key="n"
        aria-hidden="true"
        class="flex aspect-square flex-col overflow-hidden rounded-full border"
        :style="{ borderColor: row.pigment.hex }"
      >
        <span
          :data-test="n <= row.player ? 'mix-drop' : undefined"
          class="flex-1"
          :class="{ 'bg-surface-container-highest': n > row.player }"
          :style="n <= row.player ? { backgroundColor: row.pigment.hex } : undefined"
        />
        <span
          :data-test="n <= row.target ? 'target-drop' : undefined"
          class="flex-1"
          :class="{ 'bg-surface-container-highest': n > row.target }"
          :style="n <= row.target ? { backgroundColor: row.pigment.hex } : undefined"
        />
      </span>
    </div>
  </div>
</template>
