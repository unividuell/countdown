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

/**
 * A real browser canonicalises any colour set on `style` to `rgb()` the moment it is read back —
 * happy-dom does not, so the hex a caller hands in is spelled out here rather than left to a DOM
 * behaviour this suite's environment does not have.
 */
function toRgb(hex: string): string {
  const body = hex.replace('#', '')
  const full = body.length === 3 ? [...body].map((digit) => digit + digit).join('') : body
  const value = Number.parseInt(full, 16)
  return `rgb(${(value >> 16) & 0xff}, ${(value >> 8) & 0xff}, ${value & 0xff})`
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
            inset: `${outline.insetPx}px`,
            border: `2px solid ${toRgb(outline.colorHex)}`,
            transitionDelay: `${outline.delayMs}ms`,
          }"
        />
        <span
          v-if="cell.number"
          :data-test="`pattern-number-${cell.index}`"
          class="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-[0.6rem] leading-none"
          :style="{ color: cell.number.ink }"
        >
          {{ cell.number.value }}
        </span>
      </component>
    </div>
  </div>
</template>
