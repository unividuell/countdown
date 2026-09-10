<script setup lang="ts">
/**
 * The card after the round: the same board, now with everybody's tip on it, every possibility lit,
 * the palette and the scoreboard stacked below it — at every width, same as the board itself.
 *
 * „Die Möglichkeiten“ are not a form of their own — they are the tone-index inspection, starting
 * lit. One rule (`isNumberVisible`) covers both, so a reader who taps around never has to learn a
 * second vocabulary, and a possibility can be put away like anything else.
 *
 * My own outline sits outermost, at inset 0: it is the box drawn while playing, and the board under
 * it has not moved, so the switch from playing to reveal leaves it exactly where it was.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { FADE_MS, SOLUTION_DELAY_MS, TIP_COLUMN, cellDelayMs } from '@/games/revealChoreography'
import { inBackground, prefersReducedMotion } from '@/ui/motion'
import { readableTextColor } from '@/ui/readableTextColor'
import { useRevealArming } from '@/ui/useRevealArming'
import FindPatternScoreboard from './FindPatternScoreboard.vue'
import PatternGrid from './PatternGrid.vue'
import { isNumberVisible, stackedOutlines } from './marks'
import {
  RECEDED_OPACITY,
  RECEDE_DELAY_MS,
  RECEDE_MS,
  RESTORE_AT_MS,
  RESTORE_MS,
  TILE_FADE_MS,
  previewTiles,
} from './preview'
import { toneChips } from './scoreboard'
import type { ScoreRow } from './scoreboard'
import type { FindPatternPayload, FindPatternSolution } from './types'
import type { PatternNumber } from './PatternGrid.vue'

const props = defineProps<{
  payload: FindPatternPayload
  solution: FindPatternSolution
  rows: ScoreRow[]
  mineUserId: string | null
  live: boolean
  animate: boolean
}>()

/**
 * Whether the beats may run at all — the same questions every reveal in this app asks once, at
 * the moment the choreography would start: a reload (`animate` false), reduced motion, a
 * background tab, and an environment with no animation frames at all mean "just be there", not
 * "be there eventually".
 */
const still =
  !props.animate ||
  prefersReducedMotion() ||
  inBackground() ||
  typeof requestAnimationFrame !== 'function'

function hasStartIndex(row: ScoreRow): row is ScoreRow & { startIndex: number } {
  return row.startIndex !== null
}

/** Mine first, so it takes inset 0 — see the file comment. */
const outlines = computed(() => {
  const withGuess = props.rows.filter(hasStartIndex)
  const mine = withGuess.filter((row) => row.userId === props.mineUserId)
  const others = withGuess.filter((row) => row.userId !== props.mineUserId)
  return stackedOutlines(
    [...mine, ...others].map((row) => ({
      userId: row.userId,
      startIndex: row.startIndex,
      colorHex: row.colorHex,
      // Mine is already on the board — it never fades in. Everyone else arrives with their row,
      // unless the beats are skipped, in which case every tip is simply there from the start.
      delayMs:
        still || row.userId === props.mineUserId
          ? 0
          : cellDelayMs(row.tick, TIP_COLUMN, props.rows.length),
    })),
    props.solution.pattern.length,
  )
})

const preLit = computed(() => {
  const cells = new Set<number>()
  for (const start of props.solution.startIndices) {
    for (let step = 0; step < props.solution.pattern.length; step++) cells.add(start + step)
  }
  return cells
})

const toggled = ref(new Set<number>())

/**
 * Beat 3: the possibilities uncover block by block over a board that has stepped back. A tile and
 * the tone index on it are one event, so both read their moment off the same list.
 */
const tiles = computed(() =>
  still
    ? []
    : previewTiles({
        startIndices: props.solution.startIndices,
        patternLength: props.solution.pattern.length,
        blocks: props.solution.blocks,
        palette: props.solution.palette,
      }).map((tile) => ({ ...tile, fadeMs: TILE_FADE_MS })),
)

const tileDelayByCell = computed(
  () => new Map(tiles.value.map((tile) => [tile.index, tile.delayMs])),
)

const numbers = computed<PatternNumber[]>(() => {
  const cells: PatternNumber[] = []
  for (let index = 0; index < props.solution.blocks.length; index++) {
    if (!isNumberVisible(index, preLit.value, toggled.value)) continue
    const tone = props.solution.blocks[index]!
    const hex = props.solution.palette[tone]
    if (hex === undefined) continue
    // A cell the reader turned on themselves has no block to ride in with — it is simply there.
    const delayMs = tileDelayByCell.value.get(index) ?? 0
    cells.push({ index, value: tone, ink: readableTextColor(hex), delayMs })
  }
  return cells
})

function onCell(index: number): void {
  const next = new Set(toggled.value)
  if (!next.delete(index)) next.add(index)
  toggled.value = next
}

const palette = computed(() =>
  toneChips(
    props.solution.palette.map((_, tone) => tone),
    props.solution.palette,
  ),
)

const deltaLabel = computed(() =>
  new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    props.solution.delta,
  ),
)

/**
 * True from [RESTORE_AT_MS] on — the board is whole again, in time for beat 4 to land the other
 * players' outlines on a picture rather than on a hole. A timer rather than a CSS delay, because
 * the board's opacity has to travel in two directions and a transition-delay only holds one.
 */
const restored = ref(false)
let restoreTimer = 0

/**
 * Same beat, driven the same way as `FindPatternScoreboard`'s head and `HueWheelReveal`'s sector.
 * The clearing hangs off `shown` too: a transition needs a painted „from“, so the board is there for
 * frame it mounts in and steps back only once the reveal is armed.
 */
const { shown } = useRevealArming(still, () => {
  restoreTimer = window.setTimeout(() => (restored.value = true), RESTORE_AT_MS)
})

onBeforeUnmount(() => {
  if (restoreTimer) clearTimeout(restoreTimer)
})

// `still` short-circuits the whole phase: `shown` is already true there and the timer never runs,
// so without it a skipped reveal would clear the board and never bring it back.
const receded = computed(() => !still && shown.value && !restored.value)
const imageOpacity = computed(() => (receded.value ? RECEDED_OPACITY : 1))
const imageFadeMs = computed(() => (receded.value ? RECEDE_MS : RESTORE_MS))
/** Going, the board waits for the card swap to be under way; coming back it leads. */
const imageFadeDelayMs = computed(() => (receded.value ? RECEDE_DELAY_MS : 0))

const paletteOpacity = computed(() => (shown.value ? 'opacity-100' : 'opacity-0'))
const paletteStyle = {
  transitionDuration: `${FADE_MS}ms`,
  transitionDelay: `${SOLUTION_DELAY_MS}ms`,
}
</script>

<template>
  <div data-test="pattern-reveal" class="flex flex-col gap-6">
    <div class="flex flex-col gap-4">
      <!-- Capped the same as the board (see `FindPatternBoard`): board and reveal show the same
           field and must stay the same size, or the picture jumps when the view switches. -->
      <div class="mx-auto w-full max-w-[22rem]">
        <PatternGrid
          :image="props.payload.boardImage"
          :cols="props.payload.cols"
          :rows="props.payload.rows"
          :outlines="outlines"
          :numbers="numbers"
          :interactive="true"
          :still="still"
          :tiles="tiles"
          :image-opacity="imageOpacity"
          :image-fade-ms="imageFadeMs"
          :image-fade-delay-ms="imageFadeDelayMs"
          @cell="onCell"
        />
      </div>

      <!-- Below the board at every width — a desktop player's card must not carry more at a
           glance than a phone player's. Circles overlap and ring, as in the original. The delta
           rides in the heading, not the circle row: `-space-x-3` only skips the *last* child's
           end-margin, so a trailing delta span used to eat one circle's worth of overlap and
           leave the row off-centre by exactly that much. -->
      <div
        data-test="pattern-palette"
        class="flex flex-col items-center gap-2 transition-opacity"
        :class="paletteOpacity"
        :style="paletteStyle"
      >
        <span class="text-sm text-neutral-500"
          >Palette (<span data-test="palette-delta">Δ {{ deltaLabel }}</span
          >)</span
        >
        <div class="inline-flex flex-row -space-x-3">
          <span
            v-for="tone in palette"
            :key="tone.value"
            data-test="palette-tone"
            class="flex size-10 items-center justify-center rounded-full font-mono text-xs ring-1 ring-neutral-500"
            :style="{ backgroundColor: tone.hex, color: tone.ink }"
          >
            {{ tone.value }}
          </span>
        </div>
      </div>
    </div>

    <FindPatternScoreboard
      :rows="props.rows"
      :solution-chips="toneChips(props.solution.pattern, props.solution.palette)"
      :live="props.live"
      :animate="props.animate"
    />
  </div>
</template>
