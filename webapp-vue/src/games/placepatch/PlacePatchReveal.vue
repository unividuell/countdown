<script setup lang="ts">
/**
 * The card after the round: the same board, the coloured patch sewn back into its place, every tip
 * on top and the scoreboard below — Musterung's beats from `revealChoreography`.
 *
 * My own box sits outermost and has no fade: it is the stamp from playing, on a board that has not
 * moved, so the switch to the reveal leaves it exactly where it was.
 */
import { computed } from 'vue'
import { FADE_MS, SOLUTION_DELAY_MS, TIP_COLUMN, cellDelayMs } from '@/games/revealChoreography'
import { inBackground, prefersReducedMotion } from '@/ui/motion'
import { useRevealArming } from '@/ui/useRevealArming'
import PlacePatchScoreboard from './PlacePatchScoreboard.vue'
import { stackedOutlines } from './outlines'
import type { Outline } from './outlines'
import type { ScoreRow } from './scoreboard'
import type { Cell, PlacePatchPayload, PlacePatchSolution } from './types'

const props = defineProps<{
  payload: PlacePatchPayload
  solution: PlacePatchSolution
  rows: ScoreRow[]
  mineUserId: string | null
  live: boolean
  animate: boolean
  boardSrc: string
  patchSrc: string
}>()

/** A reload, reduced motion, a background tab: just be there. */
const still =
  !props.animate ||
  prefersReducedMotion() ||
  inBackground() ||
  typeof requestAnimationFrame !== 'function'

const { shown } = useRevealArming(still)

function hasCell(row: ScoreRow): row is ScoreRow & { cell: Cell } {
  return row.cell !== null
}

const outlines = computed(() => {
  const withTip = props.rows.filter(hasCell)
  const mine = withTip.filter((row) => row.userId === props.mineUserId)
  const others = withTip.filter((row) => row.userId !== props.mineUserId)
  return stackedOutlines(
    [...mine, ...others].map((row) => ({
      userId: row.userId,
      cell: row.cell,
      colorHex: row.colorHex,
      delayMs:
        still || row.userId === props.mineUserId
          ? 0
          : cellDelayMs(row.tick, TIP_COLUMN, props.rows.length),
    })),
  )
})

/** In percent of the board, so box and picture scale as one; [insetPx] moves the box inwards. */
function box(cell: Cell, insetPx = 0) {
  const offset = (percent: number) =>
    insetPx === 0 ? `${percent}%` : `calc(${percent}% + ${insetPx}px)`
  const extent = (percent: number) =>
    insetPx === 0 ? `${percent}%` : `calc(${percent}% - ${2 * insetPx}px)`
  return {
    left: offset((100 * cell.x) / props.payload.cols),
    top: offset((100 * cell.y) / props.payload.rows),
    width: extent((100 * props.payload.size) / props.payload.cols),
    height: extent((100 * props.payload.size) / props.payload.rows),
  }
}

/** The centre of the target, in % of the square: a small X. */
const CENTRE_ARM = 8
const centreX = [
  [50 - CENTRE_ARM, 50 - CENTRE_ARM, 50 + CENTRE_ARM, 50 + CENTRE_ARM],
  [50 + CENTRE_ARM, 50 - CENTRE_ARM, 50 - CENTRE_ARM, 50 + CENTRE_ARM],
]

/**
 * The target's corners, drawn just outside it — offset by their own 2 px line, so a hit's box
 * touches them and no stack of tip boxes, all of them inside the square, ever covers them.
 */
const CORNERS = [
  '-top-0.5 -left-0.5 border-t-2 border-l-2',
  '-top-0.5 -right-0.5 border-t-2 border-r-2',
  '-bottom-0.5 -left-0.5 border-b-2 border-l-2',
  '-bottom-0.5 -right-0.5 border-b-2 border-r-2',
]

const solutionStyle = computed(() => ({
  ...box(props.solution),
  transitionDuration: `${FADE_MS}ms`,
  transitionDelay: `${SOLUTION_DELAY_MS}ms`,
}))

function outlineStyle(outline: Outline) {
  return {
    ...box(outline.cell, outline.insetPx),
    boxShadow: `inset 0 0 0 3px ${outline.colorHex}`,
    opacity: still || outline.delayMs === 0 || shown.value ? 1 : 0,
    transition: `opacity ${FADE_MS}ms ease-out ${outline.delayMs}ms`,
  }
}
</script>

<template>
  <div data-test="place-patch-reveal" class="flex flex-col gap-6">
    <!-- Card-wide like the board, so the picture does not jump when the view switches. -->
    <div
      class="relative -mx-4 -mt-4 overflow-hidden"
      :style="{ aspectRatio: `${props.payload.cols} / ${props.payload.rows}` }"
    >
      <img
        :src="props.boardSrc"
        alt="Das Spielfeld in Graustufen"
        class="absolute inset-0 size-full"
        draggable="false"
      />
      <div
        data-test="place-patch-solution"
        class="pointer-events-none absolute transition-opacity"
        :class="shown ? 'opacity-100' : 'opacity-0'"
        :style="solutionStyle"
      >
        <img
          :src="props.patchSrc"
          alt="Der Ausschnitt an seinem Platz"
          class="size-full"
          draggable="false"
        />
        <!-- Marks, not a frame: the tip boxes lie on the patch's edge and would cover a frame. -->
        <svg
          class="absolute inset-0 size-full drop-shadow-[0_0_1px_rgb(0_0_0/0.6)]"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line
            v-for="([x1, y1, x2, y2], index) in centreX"
            :key="index"
            :x1="x1"
            :y1="y1"
            :x2="x2"
            :y2="y2"
            stroke="white"
            stroke-width="2"
            vector-effect="non-scaling-stroke"
          />
        </svg>
        <div
          v-for="corner in CORNERS"
          :key="corner"
          data-test="place-patch-target-corner"
          class="absolute size-2 border-white drop-shadow-[0_0_1px_rgb(0_0_0/0.6)]"
          :class="corner"
        />
      </div>
      <div
        v-for="outline in outlines"
        :key="outline.userId"
        :data-test="`place-patch-outline-${outline.userId}`"
        :data-inset="outline.insetPx"
        class="pointer-events-none absolute"
        :style="outlineStyle(outline)"
      />
    </div>

    <PlacePatchScoreboard :rows="props.rows" :live="props.live" :animate="props.animate" />
  </div>
</template>
