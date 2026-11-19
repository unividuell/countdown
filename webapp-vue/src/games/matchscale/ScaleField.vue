<script setup lang="ts">
/**
 * The square field: grid, ground line, A, B on top, and the outlines a reveal lays over them.
 * Shared by the board and the reveal; it owns no state but its gestures — view and B come in as
 * props and go out as `update:` events.
 *
 *   ┌──────────────────────┐
 *   │        ▟▙       ▟▙ ◯ │  ◯ the handle: 44 px whatever the zoom, on B's top right corner
 *   │       ▐██▌     ▐██▌  │
 *   │═══════════════════════  ground, y = 0
 *   └──────────────────────┘
 *
 * One finger on the handle scales B, on B moves it, anywhere else pans; two fingers pinch, the
 * wheel zooms. Every gesture is computed from where it started, so a lagging prop never compounds.
 */
import { useEventListener } from '@vueuse/core'
import { computed, useTemplateRef, watch } from 'vue'
import {
  FIELD_PX,
  GRID_MODE,
  gridLines,
  moveBy,
  pan,
  pinch,
  scaleToHandle,
  sizeAt,
  toScreen,
  toWorld,
  zoomAt,
  type Placement,
  type Point,
  type View,
} from './gestures'
import type { Silhouette } from './types'

export interface Outline {
  placement: Placement
  color: string
  dashed: boolean
}

const props = defineProps<{
  a: Silhouette
  b: Silhouette
  aColor: string
  bColor: string
  view: View
  placementA: Placement
  placementB: Placement
  /** B's outline at other placements: the reveal's tips. */
  outlines: readonly Outline[]
  interactive: boolean
}>()

const emit = defineEmits<{ 'update:view': [view: View]; 'update:placementB': [b: Placement] }>()

const HANDLE_RADIUS_PX = 22
/** One wheel notch (100 px of `deltaY`) zooms by about a quarter. */
const WHEEL_PX_PER_DOUBLING = 300
const LINE_PX = 16

const svg = useTemplateRef<SVGSVGElement>('svg')

const grid = computed(() => {
  const { xs, ys } = gridLines(props.view, FIELD_PX, GRID_MODE)

  return {
    xs: xs.map((x) => toScreen(props.view, { x, y: 0 }).x),
    ys: ys.map((y) => toScreen(props.view, { x: 0, y }).y),
  }
})

const groundY = computed(() => toScreen(props.view, { x: 0, y: 0 }).y)

/** Path units to field units: top left corner, then the factor. */
function transformOf(s: Silhouette, p: Placement): string {
  const { w, h } = sizeAt(s, p.scale)
  const topLeft = toScreen(props.view, { x: p.x, y: p.y + h })

  return `translate(${topLeft.x} ${topLeft.y}) scale(${(w * props.view.cellPx) / s.width})`
}

const handle = computed(() => {
  const { w, h } = sizeAt(props.b, props.placementB.scale)

  return toScreen(props.view, { x: props.placementB.x + w, y: props.placementB.y + h })
})

type Gesture =
  | { kind: 'move'; id: number; from: Point; start: Placement }
  | { kind: 'scale'; id: number; grab: Point; start: Placement }
  | { kind: 'pan'; id: number; from: Point; start: View }
  | { kind: 'pinch'; ids: [number, number]; from: [Point, Point]; start: View }

/** Every finger on the field, in field units. */
const pointers = new Map<number, Point>()
let gesture: Gesture | null = null

/** Field units per CSS pixel, or `null` before the field has a width. */
function unitsPerPx(): number | null {
  const width = svg.value?.getBoundingClientRect().width ?? 0

  return width > 0 ? FIELD_PX / width : null
}

function pointOf(event: PointerEvent | WheelEvent): Point | null {
  const rect = svg.value?.getBoundingClientRect()
  const units = unitsPerPx()
  if (rect === undefined || units === null) return null

  return { x: (event.clientX - rect.left) * units, y: (event.clientY - rect.top) * units }
}

function startOne(id: number, p: Point, units: number): Gesture {
  const hx = handle.value.x - p.x
  const hy = handle.value.y - p.y
  if (Math.hypot(hx, hy) <= HANDLE_RADIUS_PX * units) {
    return { kind: 'scale', id, grab: { x: hx, y: hy }, start: props.placementB }
  }

  const at = toWorld(props.view, p)
  const { x, y } = props.placementB
  const { w, h } = sizeAt(props.b, props.placementB.scale)
  if (at.x >= x && at.x <= x + w && at.y >= y && at.y <= y + h) {
    return { kind: 'move', id, from: at, start: props.placementB }
  }

  return { kind: 'pan', id, from: p, start: props.view }
}

function onDown(event: PointerEvent): void {
  if (!props.interactive || event.button !== 0) return

  const p = pointOf(event)
  const units = unitsPerPx()
  if (p === null || units === null) return

  try {
    // Lets the finger leave the field mid-gesture. Throws for a pointer the browser does not track.
    svg.value?.setPointerCapture(event.pointerId)
  } catch {
    // Capture is an optimisation, not a precondition.
  }

  pointers.set(event.pointerId, p)

  // A second finger turns whatever runs into a pinch: B stays where the first finger left it.
  if (pointers.size === 1) gesture = startOne(event.pointerId, p, units)
  if (pointers.size === 2) {
    const [first, second] = [...pointers.entries()] as [[number, Point], [number, Point]]
    gesture = {
      kind: 'pinch',
      ids: [first[0], second[0]],
      from: [first[1], second[1]],
      start: props.view,
    }
  }
}

function onMove(event: PointerEvent): void {
  if (!pointers.has(event.pointerId) || gesture === null) return

  const p = pointOf(event)
  if (p === null) return
  pointers.set(event.pointerId, p)

  if (gesture.kind === 'pinch') {
    const to = gesture.ids.map((id) => pointers.get(id)!) as [Point, Point]
    emit('update:view', pinch(gesture.start, gesture.from, to, FIELD_PX))
    return
  }
  if (gesture.id !== event.pointerId) return

  if (gesture.kind === 'pan') {
    emit('update:view', pan(gesture.start, p.x - gesture.from.x, p.y - gesture.from.y))
  } else if (gesture.kind === 'move') {
    const at = toWorld(props.view, p)
    emit('update:placementB', moveBy(gesture.start, at.x - gesture.from.x, at.y - gesture.from.y))
  } else {
    const at = toWorld(props.view, { x: p.x + gesture.grab.x, y: p.y + gesture.grab.y })
    emit('update:placementB', scaleToHandle(gesture.start, props.b, at))
  }
}

/** A finger that leaves ends its gesture; the one left behind of a pinch does nothing. */
function onUp(event: PointerEvent): void {
  pointers.delete(event.pointerId)
  if (gesture === null) return

  const ids = gesture.kind === 'pinch' ? gesture.ids : [gesture.id]
  if (ids.includes(event.pointerId)) gesture = null
}

function onWheel(event: WheelEvent): void {
  if (!props.interactive) return

  const p = pointOf(event)
  if (p === null) return

  event.preventDefault()
  const delta =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * LINE_PX : event.deltaY
  emit('update:view', zoomAt(props.view, p, 2 ** (-delta / WHEEL_PX_PER_DOUBLING), FIELD_PX))
}

function drop(): void {
  pointers.clear()
  gesture = null
}

watch(
  () => props.interactive,
  (interactive) => {
    if (!interactive) drop()
  },
)

// A finger lifted while the tab was away may never report it.
useEventListener(document, 'visibilitychange', () => {
  if (document.hidden) drop()
})
</script>

<template>
  <div class="relative overflow-hidden bg-surface-container-lowest select-none">
    <svg
      ref="svg"
      :viewBox="`0 0 ${FIELD_PX} ${FIELD_PX}`"
      class="block aspect-square w-full touch-none"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @lostpointercapture="onUp"
      @wheel="onWheel"
    >
      <g data-test="match-scale-grid" class="stroke-outline" stroke-width="1">
        <line
          v-for="x in grid.xs"
          :key="`x${x}`"
          :x1="x"
          :x2="x"
          y1="0"
          :y2="FIELD_PX"
          vector-effect="non-scaling-stroke"
        />
        <line
          v-for="y in grid.ys"
          :key="`y${y}`"
          x1="0"
          :x2="FIELD_PX"
          :y1="y"
          :y2="y"
          vector-effect="non-scaling-stroke"
        />
      </g>
      <line
        data-test="match-scale-ground"
        class="stroke-on-surface"
        stroke-width="2"
        x1="0"
        :x2="FIELD_PX"
        :y1="groundY"
        :y2="groundY"
        vector-effect="non-scaling-stroke"
      />
      <path
        data-test="match-scale-a"
        :d="props.a.path"
        :transform="transformOf(props.a, props.placementA)"
        :style="{ fill: props.aColor }"
      />
      <path
        data-test="match-scale-b"
        :d="props.b.path"
        :transform="transformOf(props.b, props.placementB)"
        :style="{ fill: props.bColor }"
      />
      <path
        v-for="(outline, i) in props.outlines"
        :key="i"
        data-test="match-scale-outline"
        :d="props.b.path"
        :transform="transformOf(props.b, outline.placement)"
        fill="none"
        :stroke="outline.color"
        stroke-width="2"
        :stroke-dasharray="outline.dashed ? '6 4' : undefined"
        vector-effect="non-scaling-stroke"
      />
    </svg>
    <span
      v-if="props.interactive"
      role="img"
      aria-label="Größe ändern"
      class="pointer-events-none absolute size-11 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md"
      :style="{
        left: `${(handle.x / FIELD_PX) * 100}%`,
        top: `${(handle.y / FIELD_PX) * 100}%`,
        backgroundColor: props.bColor,
      }"
    />
  </div>
</template>
