<script setup lang="ts">
/**
 * The board: a server-rendered image with a transparent cell grid over it.
 *
 * The image is the anti-cheat lever — no colour reaches this component as a value, and the overlay
 * addresses cells by index alone. That is also what lets board and reveal be the same picture: the
 * marks change, the ground does not, so the tip drawn while playing sits exactly where it was left
 * when the reveal arrives.
 *
 * `image-rendering: pixelated` keeps the block edges hard while the width is fluid; the grid uses the
 * same width, so the two cannot drift apart.
 */
import { computed } from 'vue'
import type { CellOutline } from './marks'

export interface PatternNumber {
  index: number
  value: number
  /** Ink that reads against this cell's tone — decided by the caller, which knows the palette. */
  ink: string
}

const props = defineProps<{
  image: string
  cols: number
  rows: number
  outlines: CellOutline[]
  numbers: PatternNumber[]
  interactive: boolean
}>()

const emit = defineEmits<{ cell: [index: number] }>()

interface CellView {
  index: number
  outlines: CellOutline[]
  number: PatternNumber | undefined
}

/**
 * One view model per cell, so the template narrows `cell.number` from a single property access
 * instead of asserting past a `Map.get` it already guarded with `.has`.
 */
const cellViews = computed<CellView[]>(() => {
  const outlinesByCell = new Map<number, CellOutline[]>()
  for (const outline of props.outlines) {
    outlinesByCell.set(outline.index, [...(outlinesByCell.get(outline.index) ?? []), outline])
  }
  const numbersByCell = new Map(props.numbers.map((entry) => [entry.index, entry] as const))
  return Array.from({ length: props.cols * props.rows }, (_, index) => ({
    index,
    outlines: outlinesByCell.get(index) ?? [],
    number: numbersByCell.get(index),
  }))
})

// Guarded here, not in the template: a non-interactive grid renders `<div>`s, so this handler is
// simply never reachable by a click on one of them — this is the belt to that suspenders.
function onCell(index: number): void {
  if (props.interactive) emit('cell', index)
}
</script>

<template>
  <div class="relative w-full">
    <img
      :src="props.image"
      alt=""
      class="block w-full select-none"
      style="image-rendering: pixelated"
      draggable="false"
    />
    <div
      class="absolute inset-0 grid"
      :style="{ gridTemplateColumns: `repeat(${props.cols}, minmax(0, 1fr))` }"
    >
      <component
        :is="props.interactive ? 'button' : 'div'"
        v-for="cell in cellViews"
        :key="cell.index"
        :type="props.interactive ? 'button' : undefined"
        :aria-label="props.interactive ? `Zelle ${cell.index + 1}` : undefined"
        :data-test="`pattern-cell-${cell.index}`"
        class="relative"
        :class="props.interactive ? 'cursor-pointer' : ''"
        @click="onCell(cell.index)"
      >
        <span
          v-for="(outline, depth) in cell.outlines"
          :key="depth"
          :data-test="`pattern-outline-${cell.index}`"
          class="pointer-events-none absolute transition-opacity"
          :style="{
            top: `${outline.insetPx}px`,
            right: `${outline.insetPx}px`,
            bottom: `${outline.insetPx}px`,
            left: `${outline.insetPx}px`,
            border: `2px solid ${outline.colorHex}`,
            transitionDelay: `${outline.delayMs}ms`,
          }"
        />
        <span
          v-if="cell.number"
          :data-test="`pattern-number-${cell.index}`"
          class="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-[0.6rem] leading-none transition-opacity"
          :style="{ color: cell.number.ink }"
        >
          {{ cell.number.value }}
        </span>
      </component>
    </div>
  </div>
</template>
