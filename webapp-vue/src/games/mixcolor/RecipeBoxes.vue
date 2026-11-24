<script setup lang="ts">
/**
 * A recipe as one box per pigment: grey like an empty drop, ringed in its pigment, filled from the
 * bottom by its share of [max] (5 of 20 drops fill a quarter) and labelled with its drop count. Past
 * half full the number sits on the pigment, so its ink follows the pigment.
 *
 *   Cyan  Magenta  Gelb  Weiß  Schwarz
 *   ┌─┐   ┌─┐      ┌─┐   ┌─┐   ┌─┐
 *   │5│   │0│      │2│   │0│   │0│
 *   └▀┘   └─┘      └─┘   └─┘   └─┘
 */
import { computed } from 'vue'
import { readableTextColor } from '@/ui/readableTextColor'
import type { MixColorPigment, Recipe } from './types'

const props = defineProps<{
  pigments: MixColorPigment[]
  recipe: Recipe
  /** The count that fills a box: the table's largest, so every box shares one scale. */
  max: number
}>()

const boxes = computed(() =>
  props.pigments.map((pigment) => {
    const drops = props.recipe[pigment.key] ?? 0
    const share = Math.min(1, drops / Math.max(1, props.max))

    return {
      pigment,
      drops,
      height: `${share * 100}%`,
      ink: share >= 0.5 ? readableTextColor(pigment.hex) : undefined,
    }
  }),
)

const label = computed(() =>
  boxes.value.map(({ pigment, drops }) => `${pigment.name} ${drops}`).join(', '),
)
</script>

<template>
  <div role="img" :aria-label="label" class="flex flex-row gap-px">
    <span
      v-for="box in boxes"
      :key="box.pigment.key"
      :data-test="`box-${box.pigment.key}`"
      aria-hidden="true"
      class="relative flex size-5 items-center justify-center border bg-surface-container-highest text-xs text-on-surface tabular-nums"
      :style="{ borderColor: box.pigment.hex, color: box.ink }"
    >
      <span
        data-test="box-fill"
        class="absolute inset-x-0 bottom-0"
        :style="{ height: box.height, backgroundColor: box.pigment.hex }"
      />
      <span class="relative">{{ box.drops }}</span>
    </span>
  </div>
</template>
