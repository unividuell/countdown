<script setup lang="ts">
/**
 * The pipe board: one plate per cell, the pipe lying on it. Plates stand still, pipes turn. Shared
 * by the playing board and the reveal, which differ only in what they hand in.
 */
import { prefersReducedMotion } from '@/ui/motion'
import { PLATE_URL, tileUrl } from './tiles'
import type { PipeKindCode } from './types'

const props = defineProps<{
  size: number
  /** `null` draws the plates alone, as under the reveal cover. */
  kinds: readonly PipeKindCode[] | null
  /** Quarter turns clockwise per cell; unbounded, so a pipe keeps spinning the same way. */
  turns: readonly number[]
  wet: ReadonlySet<number>
  leakCell: number | null
  interactive: boolean
}>()

const emit = defineEmits<{ tap: [cell: number] }>()

// Asked once per mount: a visitor flipping the setting mid-round sees it on the next board.
const still = prefersReducedMotion()

function tap(cell: number): void {
  if (props.interactive) emit('tap', cell)
}
</script>

<template>
  <div
    data-test="pipe-grid"
    class="mx-auto grid w-full max-w-[28rem] touch-manipulation select-none"
    :style="{ gridTemplateColumns: `repeat(${props.size}, 1fr)` }"
  >
    <button
      v-for="cell in props.size * props.size"
      :key="cell"
      type="button"
      class="relative aspect-square"
      :class="{ 'cursor-pointer': props.interactive }"
      :aria-label="`Kachel ${cell}`"
      @click="tap(cell - 1)"
    >
      <img
        :src="PLATE_URL"
        alt=""
        draggable="false"
        class="pointer-events-none absolute inset-0 size-full [image-rendering:pixelated] [-webkit-touch-callout:none] [-webkit-user-drag:none]"
      />
      <img
        v-if="props.kinds"
        :src="tileUrl(props.kinds[cell - 1]!, props.wet.has(cell - 1))"
        alt=""
        draggable="false"
        class="pointer-events-none absolute inset-0 size-full [image-rendering:pixelated] [-webkit-touch-callout:none] [-webkit-user-drag:none]"
        :class="still ? '' : 'transition-transform duration-150 ease-out'"
        :style="{ transform: `rotate(${(props.turns[cell - 1] ?? 0) * 90}deg)` }"
      />
      <span
        v-if="props.leakCell === cell - 1"
        data-test="pipe-leak"
        class="pointer-events-none absolute inset-[6%] rounded-md ring-3 ring-red-500"
      />
    </button>
  </div>
</template>
