<script setup lang="ts">
/**
 * The pipe board: one plate per cell, the pipe lying on it. Plates stand still and glow where the
 * water ran; pipes turn. An end's picture stands upright on its turning stub. Shared by the playing
 * board and the reveal, which differ only in what they hand in.
 */
import { prefersReducedMotion } from '@/ui/motion'
import { motifUrl, plateUrl, puddleUrl, tileUrl } from './tiles'
import { TURN_MS } from './turns'
import type { PipeKindCode } from './types'

const props = defineProps<{
  size: number
  /** `null` draws the plates alone, as under the reveal cover. */
  kinds: readonly PipeKindCode[] | null
  /** Quarter turns clockwise per cell; unbounded, so a pipe keeps spinning the same way. */
  turns: readonly number[]
  wet: ReadonlySet<number>
  /** Cells under dirty water: where it burst, or every pipe it missed. */
  puddles: ReadonlySet<number>
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
    :inert="!props.interactive || undefined"
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
        :src="plateUrl(props.wet.has(cell - 1))"
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
        :class="still ? '' : 'transition-transform ease-out'"
        :style="{
          transform: `rotate(${(props.turns[cell - 1] ?? 0) * 90}deg)`,
          transitionDuration: `${TURN_MS}ms`,
        }"
      />
      <img
        v-if="props.kinds && motifUrl(props.kinds[cell - 1]!, props.wet.has(cell - 1))"
        data-test="pipe-motif"
        :src="motifUrl(props.kinds[cell - 1]!, props.wet.has(cell - 1))!"
        alt=""
        draggable="false"
        class="pointer-events-none absolute inset-0 size-full [image-rendering:pixelated] [-webkit-touch-callout:none] [-webkit-user-drag:none]"
      />
      <img
        v-if="props.puddles.has(cell - 1)"
        data-test="pipe-puddle"
        :src="puddleUrl(cell - 1)"
        alt=""
        draggable="false"
        class="pointer-events-none absolute inset-0 size-full [image-rendering:pixelated] [-webkit-touch-callout:none] [-webkit-user-drag:none]"
      />
    </button>
  </div>
</template>
