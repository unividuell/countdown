<script setup lang="ts">
/**
 * The card after the round: the same board, now with everybody's tip on it, every possibility lit,
 * the palette beside it and the scoreboard below.
 *
 * „Die Möglichkeiten“ are not a form of their own — they are the tone-index inspection, starting
 * lit. One rule (`isNumberVisible`) covers both, so a reader who taps around never has to learn a
 * second vocabulary, and a possibility can be put away like anything else.
 *
 * My own outline sits outermost, at inset 0: it is the box drawn while playing, and the board under
 * it has not moved, so the switch from playing to reveal leaves it exactly where it was.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { FADE_MS, SOLUTION_DELAY_MS, TIP_COLUMN, cellDelayMs } from '@/games/revealChoreography'
import { inBackground, prefersReducedMotion } from '@/ui/motion'
import { readableTextColor } from '@/ui/readableTextColor'
import FindPatternScoreboard from './FindPatternScoreboard.vue'
import PatternGrid from './PatternGrid.vue'
import { isNumberVisible, stackedOutlines } from './marks'
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

/** Beat 3, together for every possibility — there is no per-cell order to stagger them by. */
const numberDelayMs = still ? 0 : SOLUTION_DELAY_MS

const numbers = computed<PatternNumber[]>(() => {
  const cells: PatternNumber[] = []
  for (let index = 0; index < props.solution.blocks.length; index++) {
    if (!isNumberVisible(index, preLit.value, toggled.value)) continue
    const tone = props.solution.blocks[index]!
    const hex = props.solution.palette[tone]
    if (hex === undefined) continue
    cells.push({ index, value: tone, ink: readableTextColor(hex), delayMs: numberDelayMs })
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

/** Same beat, driven the same way as `FindPatternScoreboard`'s head and `HueWheelReveal`'s sector. */
const shown = ref(still)
let frame = 0
onMounted(() => {
  if (still) return
  // Firefox only starts a transition off a style it has already resolved in an earlier frame —
  // see `HueWheelReveal` for the full explanation. One forced reflow, then flip on the next frame.
  frame = requestAnimationFrame(() => {
    void document.body.offsetHeight
    frame = requestAnimationFrame(() => {
      shown.value = true
    })
  })
})
onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame)
})

const paletteOpacity = computed(() => (shown.value ? 'opacity-100' : 'opacity-0'))
const paletteStyle = {
  transitionDuration: `${FADE_MS}ms`,
  transitionDelay: `${SOLUTION_DELAY_MS}ms`,
}
</script>

<template>
  <div data-test="pattern-reveal" class="flex flex-col gap-6">
    <div class="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_8rem] md:items-start">
      <div class="min-w-0">
        <PatternGrid
          :image="props.payload.boardImage"
          :cols="props.payload.cols"
          :rows="props.payload.rows"
          :outlines="outlines"
          :numbers="numbers"
          :interactive="true"
          :still="still"
          @cell="onCell"
        />
      </div>

      <!-- A narrow vertical block, not a bar: at four swatches wide it stays compact under the
           board on a phone, and the same shape works unchanged beside it from `md` on. -->
      <div
        data-test="pattern-palette"
        class="flex flex-col items-center gap-2 transition-opacity"
        :class="paletteOpacity"
        :style="paletteStyle"
      >
        <span class="text-sm text-neutral-500">Palette</span>
        <div class="flex flex-row gap-1">
          <span
            v-for="tone in palette"
            :key="tone.value"
            data-test="palette-tone"
            class="flex size-10 items-center justify-center rounded-full font-mono text-xs"
            :style="{ backgroundColor: tone.hex, color: tone.ink }"
          >
            {{ tone.value }}
          </span>
        </div>
        <span data-test="palette-delta" class="font-mono text-sm">Δ {{ deltaLabel }}</span>
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
