<script setup lang="ts">
/**
 * The curve the original's discussion happened over, as plain SVG: one line per player in their
 * colour, the beat as a ceiling with the game-over band above it, a dashed average per player.
 *
 * A scrub instead of a tooltip — a finger dragged across reads the nearest level; a phone has no
 * hover. The legend is the table below: selecting a row brings its line forward.
 */
import { computed, ref } from 'vue'
import { VIEW, frameFor, gridMs, levelAt, levelTicks, polyline, xOf, yLabels, yOf } from './chart'
import type { DedusterRow } from './scoreboard'

const props = defineProps<{
  rows: DedusterRow[]
  tiles: number
  intervalMs: number
  selectedUserId: string | null
  /** The scrubbed level, owned by the reveal so the photo can outline it too. */
  level: number | null
}>()

const emit = defineEmits<{ scrub: [level: number] }>()

const frame = computed(() =>
  frameFor({ tiles: props.tiles, intervalMs: props.intervalMs, rows: props.rows }),
)

const lines = computed(() =>
  props.rows.map((row) => {
    const sum = row.reactionsMs.reduce((a, b) => a + b, 0)
    return {
      row,
      points: polyline(frame.value, row.reactionsMs),
      averageY:
        row.reactionsMs.length === 0 ? null : yOf(frame.value, sum / row.reactionsMs.length),
      opacity: props.selectedUserId === null || props.selectedUserId === row.userId ? '1' : '0.25',
    }
  }),
)

const ticks = computed(() => levelTicks(props.tiles))
const grid = computed(() => gridMs(frame.value))
const labels = computed(() => yLabels(frame.value))
const plotBottom = VIEW.height - VIEW.bottom

const readout = computed(() => {
  const level = props.level
  if (level === null) return null
  const focus = props.rows.find((r) => r.userId === props.selectedUserId) ?? props.rows[0]
  const ms = focus?.reactionsMs[level]
  return {
    x: xOf(frame.value, level),
    text: ms === undefined ? `Level ${level}` : `Level ${level} · ${ms} ms`,
  }
})

const svg = ref<SVGSVGElement | null>(null)
const dragging = ref(false)

function scrubAt(event: PointerEvent): void {
  const el = svg.value
  if (el === null) return
  const box = el.getBoundingClientRect()
  const x = ((event.clientX - box.left) / box.width) * VIEW.width
  emit('scrub', levelAt(frame.value, x))
}

function onDown(event: PointerEvent): void {
  dragging.value = true
  scrubAt(event)
}

function onMove(event: PointerEvent): void {
  if (dragging.value) scrubAt(event)
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <h2 class="text-lg">Reaktionszeit (kleiner ist besser)</h2>
    <svg
      ref="svg"
      data-test="deduster-chart"
      :viewBox="`0 0 ${VIEW.width} ${VIEW.height}`"
      class="w-full touch-pan-y text-neutral-500 select-none"
      role="img"
      aria-label="Reaktionszeit je Level, ein Verlauf je Spieler"
      @pointerdown="onDown"
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
        class="stroke-neutral-200 dark:stroke-neutral-800"
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
        :x="VIEW.left - 4"
        :y="yOf(frame, ms) + 3"
        text-anchor="end"
        class="fill-current text-[8px]"
      >
        {{ ms }}
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
        <line
          v-if="line.averageY !== null"
          data-test="chart-average"
          :x1="VIEW.left"
          :x2="VIEW.width - VIEW.right"
          :y1="line.averageY"
          :y2="line.averageY"
          :stroke="line.row.colorHex"
          :stroke-opacity="line.opacity"
          stroke-width="0.75"
          stroke-dasharray="3 3"
        />
        <polyline
          :points="line.points"
          fill="none"
          :stroke="line.row.colorHex"
          :stroke-opacity="line.opacity"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
      </template>

      <template v-if="readout">
        <line
          data-test="chart-guide"
          :x1="readout.x"
          :x2="readout.x"
          :y1="VIEW.top"
          :y2="VIEW.height - VIEW.bottom"
          class="stroke-neutral-900 dark:stroke-neutral-100"
          stroke-width="0.75"
        />
        <text
          data-test="chart-readout"
          :x="Math.min(readout.x + 4, VIEW.width - VIEW.right - 70)"
          :y="VIEW.top + 10"
          class="fill-neutral-900 text-[9px] dark:fill-neutral-100"
        >
          {{ readout.text }}
        </text>
      </template>
    </svg>
  </div>
</template>
