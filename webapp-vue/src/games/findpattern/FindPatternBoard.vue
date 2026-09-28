<script setup lang="ts">
/**
 * Playing: the board, the sought run under it, and the rules below both.
 *
 * The selection lives here as a plain `ref` of indices and nowhere else — no derived „where the
 * pattern is“ value, not even for a hint, because a materialised answer in component state is
 * exactly what the anti-cheat spec forbids. All this component knows is which cells were tapped.
 *
 * Layout: one column, at every width — a second column beside the board would make a desktop
 * player's view more informative than a phone player's, which the community shell it lives in
 * rules out for every page. The board is capped at 22rem even on a wide screen; uncapped, a
 * grid this tall (8 × 14) forces the searcher to scroll while comparing blocks.
 */
import { computed, ref } from 'vue'
import type { AwardRule } from '@/api/types'
import RevealCover from '@/ui/RevealCover.vue'
import FindPatternBriefing from './FindPatternBriefing.vue'
import PatternGrid from './PatternGrid.vue'
import { stackedOutlines } from './marks'
import { isComplete, nextSelection, startIndexOfSelection } from './selection'
import type { FindPatternPayload, FindPatternScene } from './types'

const props = withDefaults(
  defineProps<{
    payload: FindPatternPayload | null
    /** The viewer's own avatar colour — the tip is marked in it, here and in the reveal. */
    myColorHex: string
    disabled: boolean
    /**
     * The start index of a guess already submitted, or `null`/absent for none. Never folded into
     * `selected`: it is what a reload has to show, not a seed a tap could extend or restart.
     */
    submittedStartIndex?: number | null
    awardRule: AwardRule | null
    awardPoints: number | null
    /** The layout under the cover, while `payload` is still withheld. */
    scene?: FindPatternScene | null
    /** Sealed: the empty board under the cover, and the hold that reveals it. */
    sealed?: boolean
  }>(),
  { scene: null, sealed: false, submittedStartIndex: null },
)

const emit = defineEmits<{ guess: [value: { startIndex: number }]; reveal: [] }>()

/** What the board is laid out for: the real payload once it arrives, the scene while sealed. */
const layout = computed(() => props.payload ?? props.scene)

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
    layout.value?.patternLength ?? 0,
  )
})

function onCell(index: number): void {
  if (props.disabled || props.sealed) return
  const patternLength = layout.value?.patternLength ?? 0
  const next = nextSelection(selected.value, index, patternLength)
  selected.value = next
  if (!isComplete(next, patternLength)) return
  const startIndex = startIndexOfSelection(next, patternLength)
  // `null` cannot happen under `nextSelection`; leaving the selection standing is the honest
  // fallback if it ever did — a guess is not worth inventing.
  if (startIndex !== null) emit('guess', { startIndex })
}
</script>

<template>
  <div data-test="pattern-board" class="flex flex-col gap-6">
    <!-- The outer box cancels RoundSurface's top and side padding and pays it back, so the cover
         spans the card edge to edge like the map does in `SpotObjectGame`. The bottom padding,
         cancelled by `-mb-4`, lets the blur fade out before the glass ends; the board stays
         where it was. -->
    <div v-if="layout" class="relative -mx-4 -mt-4 -mb-4 p-4">
      <div
        data-test="pattern-play"
        class="mx-auto flex w-full max-w-[22rem] flex-col items-center gap-3"
        :inert="props.sealed || undefined"
      >
        <PatternGrid
          :image="props.payload?.boardImage ?? null"
          :cols="layout.cols"
          :rows="layout.rows"
          :outlines="outlines"
          :numbers="[]"
          :interactive="!props.disabled && !props.sealed"
          @cell="onCell"
        />
        <p class="text-center text-lg">Finde das folgende Muster im Spielfeld</p>
        <!-- Same width as the board, larger blocks: the run is what has to be memorised, and four
           near-identical tones separate better on area. The server renders it that way. -->
        <img
          v-if="props.payload"
          :src="props.payload.patternImage"
          alt="Das gesuchte Muster"
          class="block w-full border-2 border-black"
          style="image-rendering: pixelated"
          draggable="false"
        />
        <div
          v-else
          data-test="pattern-image-placeholder"
          class="block w-full border-2 border-black bg-neutral-100"
          :style="{ aspectRatio: `${layout.patternLength} / 1` }"
        />
      </div>
      <RevealCover
        v-if="props.sealed"
        state="ready"
        :busy="props.disabled"
        @start="emit('reveal')"
      />
    </div>

    <FindPatternBriefing :award-rule="props.awardRule" :award-points="props.awardPoints" />
  </div>
</template>
