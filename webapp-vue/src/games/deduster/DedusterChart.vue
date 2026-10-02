<script setup lang="ts">
/**
 * The curve the original's discussion happened over, as plain SVG: one line per player in their
 * colour, dashed on to how the run ended, the beat as a ceiling with the game-over band above it,
 * a dashed average per player.
 *
 * A scrub instead of a tooltip — a finger dragged across reads the nearest level; a phone has no
 * hover — and a tap outside the chart lets go of it. Nobody is selected at first and every line
 * shows in full; a name in the table below, or a tap on one line alone, brings that line forward and
 * reads its time at the scrub.
 */
import { computed, ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import {
  VIEW,
  frameFor,
  gridMs,
  levelAt,
  levelTicks,
  polyline,
  runAt,
  tailOf,
  xOf,
  yLabels,
  yOf,
} from './chart'
import type { DedusterRow } from './scoreboard'

const props = defineProps<{
  rows: DedusterRow[]
  tiles: number
  intervalMs: number
  selectedUserId: string | null
  /** The scrubbed level, owned by the reveal so the photo can outline it too. */
  level: number | null
}>()

const emit = defineEmits<{ scrub: [level: number | null]; select: [userId: string] }>()

/** How near a tap must land to a line to pick it, in screen pixels: a fingertip, not a cursor. */
const TAP_RADIUS_PX = 12
/** A pointer that moved further than this between press and click was scrubbing, not tapping. */
const DRAG_PX = 4

const frame = computed(() =>
  frameFor({ tiles: props.tiles, intervalMs: props.intervalMs, rows: props.rows }),
)

const lines = computed(() =>
  props.rows.map((row) => {
    const sum = row.reactionsMs.reduce((a, b) => a + b, 0)
    return {
      row,
      points: polyline(frame.value, row.reactionsMs),
      tail: tailOf(frame.value, row),
      average: row.reactionsMs.length === 0 ? null : sum / row.reactionsMs.length,
      opacity: props.selectedUserId === null || props.selectedUserId === row.userId ? '1' : '0.25',
    }
  }),
)

const ticks = computed(() => levelTicks(props.tiles))
const grid = computed(() => gridMs(frame.value))
const labels = computed(() => yLabels(frame.value))
const plotBottom = VIEW.height - VIEW.bottom
const thousands = new Intl.NumberFormat('de-DE')

const readout = computed(() => {
  const level = props.level
  if (level === null) return null
  const ms = props.rows.find((r) => r.userId === props.selectedUserId)?.reactionsMs[level]
  return {
    x: xOf(frame.value, level),
    text: ms === undefined ? `Level ${level}` : `Level ${level} · ${ms} ms`,
  }
})

const svg = ref<SVGSVGElement | null>(null)
const dragging = ref(false)
let pressedAt: { x: number; y: number } | null = null

/** The pointer in the viewBox's units, and how many of them a screen pixel is. */
function inView(event: MouseEvent): { x: number; y: number; perPx: number } | null {
  const el = svg.value
  if (el === null) return null
  const box = el.getBoundingClientRect()
  return {
    x: ((event.clientX - box.left) / box.width) * VIEW.width,
    y: ((event.clientY - box.top) / box.height) * VIEW.height,
    perPx: VIEW.width / box.width,
  }
}

function scrubAt(event: PointerEvent): void {
  const p = inView(event)
  if (p !== null) emit('scrub', levelAt(frame.value, p.x))
}

function onDown(event: PointerEvent): void {
  dragging.value = true
  pressedAt = { x: event.clientX, y: event.clientY }
  scrubAt(event)
}

function onClick(event: MouseEvent): void {
  const moved =
    pressedAt === null ||
    Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) > DRAG_PX
  const p = inView(event)
  if (moved || p === null) return
  const userId = runAt(frame.value, props.rows, p, TAP_RADIUS_PX * p.perPx)
  if (userId !== null) emit('select', userId)
}

onClickOutside(svg, () => {
  if (props.level !== null) emit('scrub', null)
})

function onMove(event: PointerEvent): void {
  if (dragging.value) scrubAt(event)
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <h2 class="text-2xl">Reaktionszeit (kleiner ist besser)</h2>
    <svg
      ref="svg"
      data-test="deduster-chart"
      :viewBox="`0 0 ${VIEW.width} ${VIEW.height}`"
      class="w-full touch-pan-y text-neutral-500 select-none"
      role="img"
      aria-label="Reaktionszeit je Level, ein Verlauf je Spieler"
      @pointerdown="onDown"
      @click="onClick"
      @pointermove="onMove"
      @pointerup="dragging = false"
      @pointerleave="dragging = false"
    >
      <line
        v-for="ms in grid"
        :key="ms"
        data-test="chart-grid"
        :x1="VIEW.left"
        :x2="VIEW.width - VIEW.right"
        :y1="yOf(frame, ms)"
        :y2="yOf(frame, ms)"
        class="stroke-neutral-200"
        stroke-width="0.5"
      />
      <rect
        data-test="chart-game-over"
        :x="VIEW.left"
        :y="VIEW.top"
        :width="VIEW.width - VIEW.left - VIEW.right"
        :height="yOf(frame, props.intervalMs) - VIEW.top"
        class="fill-red-500/15"
      />
      <line
        :x1="VIEW.left"
        :x2="VIEW.width - VIEW.right"
        :y1="yOf(frame, props.intervalMs)"
        :y2="yOf(frame, props.intervalMs)"
        class="stroke-current"
        stroke-width="0.5"
      />
      <text
        v-for="ms in labels"
        :key="ms"
        data-test="chart-y-label"
        :x="VIEW.left - 4"
        :y="yOf(frame, ms) + 3"
        text-anchor="end"
        class="fill-current text-[8px]"
      >
        {{ thousands.format(ms) }}
      </text>
      <text
        data-test="chart-y-title"
        :x="VIEW.left - 4"
        :y="VIEW.top + 3"
        text-anchor="end"
        class="fill-current text-[8px]"
      >
        [ms]
      </text>

      <line
        data-test="chart-x-axis"
        :x1="VIEW.left"
        :x2="VIEW.width - VIEW.right"
        :y1="plotBottom"
        :y2="plotBottom"
        class="stroke-current"
        stroke-width="0.75"
      />
      <template v-for="tick in ticks" :key="tick">
        <line
          :x1="xOf(frame, tick)"
          :x2="xOf(frame, tick)"
          :y1="plotBottom"
          :y2="plotBottom + 3"
          class="stroke-current"
          stroke-width="0.75"
        />
        <text
          data-test="chart-x-tick"
          :x="xOf(frame, tick)"
          :y="plotBottom + 11"
          text-anchor="middle"
          class="fill-current text-[8px]"
        >
          {{ tick }}
        </text>
      </template>
      <text
        data-test="chart-x-title"
        :x="(VIEW.left + VIEW.width - VIEW.right) / 2"
        :y="VIEW.height - 3"
        text-anchor="middle"
        class="fill-current text-[8px]"
      >
        Level
      </text>

      <template v-for="line in lines" :key="line.row.userId">
        <template v-if="line.average !== null">
          <line
            data-test="chart-average"
            :x1="VIEW.left"
            :x2="VIEW.width - VIEW.right"
            :y1="yOf(frame, line.average)"
            :y2="yOf(frame, line.average)"
            :stroke="line.row.colorHex"
            :stroke-opacity="line.opacity"
            stroke-width="0.75"
            stroke-dasharray="3 3"
          />
          <text
            v-if="line.row.userId === props.selectedUserId"
            data-test="chart-average-label"
            :x="VIEW.width - VIEW.right"
            :y="yOf(frame, line.average) - 2"
            text-anchor="end"
            :fill="line.row.colorHex"
            class="text-[8px]"
          >
            ⌀ {{ thousands.format(Math.round(line.average)) }}
          </text>
        </template>
        <polyline
          :points="line.points"
          fill="none"
          :stroke="line.row.colorHex"
          :stroke-opacity="line.opacity"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
        <!-- How the run ended, dashed: it is no hit, but scrubbing on to it shows the photo's verdict. -->
        <line
          v-if="line.tail?.from"
          data-test="chart-tail"
          :x1="line.tail.from.x"
          :y1="line.tail.from.y"
          :x2="line.tail.to.x"
          :y2="line.tail.to.y"
          :stroke="line.row.colorHex"
          :stroke-opacity="line.opacity"
          stroke-width="1.5"
          stroke-dasharray="4 3"
        />
        <circle
          v-else-if="line.tail"
          data-test="chart-tail"
          :cx="line.tail.to.x"
          :cy="line.tail.to.y"
          r="1.5"
          :fill="line.row.colorHex"
          :fill-opacity="line.opacity"
        />
      </template>

      <template v-if="readout">
        <line
          data-test="chart-guide"
          :x1="readout.x"
          :x2="readout.x"
          :y1="VIEW.top"
          :y2="VIEW.height - VIEW.bottom"
          class="stroke-neutral-900"
          stroke-width="0.75"
        />
        <text
          data-test="chart-readout"
          :x="Math.min(readout.x + 4, VIEW.width - VIEW.right - 70)"
          :y="VIEW.top + 10"
          class="fill-neutral-900 text-[9px]"
        >
          {{ readout.text }}
        </text>
      </template>
    </svg>
  </div>
</template>
