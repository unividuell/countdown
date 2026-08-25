<script setup lang="ts">
/**
 * Playing: the board, the sought run under it, and the rules beside it.
 *
 * The selection lives here as a plain `ref` of indices and nowhere else — no derived „where the
 * pattern is“ value, not even for a hint, because a materialised answer in component state is
 * exactly what the anti-cheat spec forbids. All this component knows is which cells were tapped.
 *
 * Layout: one column on a phone, two from `md` on, with the rules docked to the right of the board.
 * The board is portrait (8 × 14), so on a wide screen the space beside it is free anyway — and the
 * rules being *next to* the game rather than under it is what keeps them readable while playing.
 */
import { computed, ref } from 'vue'
import InfoBox from '@/ui/InfoBox.vue'
import PatternGrid from './PatternGrid.vue'
import PatternRules from './PatternRules.vue'
import { stackedOutlines } from './marks'
import { isComplete, nextSelection, startIndexOfSelection } from './selection'
import type { FindPatternPayload } from './types'

const props = defineProps<{
  payload: FindPatternPayload
  /** The viewer's own avatar colour — the tip is marked in it, here and in the reveal. */
  myColorHex: string
  disabled: boolean
  /**
   * The start index of a guess already submitted, or `null`/absent for none. Never folded into
   * `selected`: it is what a reload has to show, not a seed a tap could extend or restart.
   */
  submittedStartIndex?: number | null
}>()

const emit = defineEmits<{ guess: [value: { startIndex: number }] }>()

const selected = ref<number[]>([])

/**
 * The growing selection while it exists, one outline per tapped cell, all at inset 0 — the reveal
 * stacks, the board never has to. Once a guess is submitted `disabled` goes true and `selected` is
 * never touched again, so the submitted tip's own run of `patternLength` cells takes over instead.
 */
const outlines = computed(() => {
  if (selected.value.length > 0) {
    return stackedOutlines(
      selected.value.map((index) => ({
        userId: 'mine',
        startIndex: index,
        colorHex: props.myColorHex,
        delayMs: 0,
      })),
      1,
    )
  }
  if (props.submittedStartIndex === undefined || props.submittedStartIndex === null) return []
  return stackedOutlines(
    [
      {
        userId: 'mine',
        startIndex: props.submittedStartIndex,
        colorHex: props.myColorHex,
        delayMs: 0,
      },
    ],
    props.payload.patternLength,
  )
})

function onCell(index: number): void {
  if (props.disabled) return
  const next = nextSelection(selected.value, index, props.payload.patternLength)
  selected.value = next
  if (!isComplete(next, props.payload.patternLength)) return
  const startIndex = startIndexOfSelection(next, props.payload.patternLength)
  // `null` cannot happen under `nextSelection`; leaving the selection standing is the honest
  // fallback if it ever did — a guess is not worth inventing.
  if (startIndex !== null) emit('guess', { startIndex })
}
</script>

<template>
  <div
    data-test="pattern-board"
    class="flex flex-col gap-6 md:grid md:grid-cols-[minmax(0,1fr)_20rem] md:items-start"
  >
    <div class="flex flex-col items-center gap-3">
      <PatternGrid
        :image="props.payload.boardImage"
        :cols="props.payload.cols"
        :rows="props.payload.rows"
        :outlines="outlines"
        :numbers="[]"
        :interactive="!props.disabled"
        @cell="onCell"
      />
      <p class="text-center text-lg">Finde das folgende Muster im Spielfeld</p>
      <!-- Same width as the board, larger blocks: the run is what has to be memorised, and four
           near-identical tones separate better on area. The server renders it that way. -->
      <img
        :src="props.payload.patternImage"
        alt="Das gesuchte Muster"
        class="block w-full border-2 border-black"
        style="image-rendering: pixelated"
        draggable="false"
      />
    </div>

    <InfoBox storage-key="find-pattern">
      <template #abstract> Entdecke im Spielfeld das gesuchte Muster. </template>
      <PatternRules />
    </InfoBox>
  </div>
</template>
