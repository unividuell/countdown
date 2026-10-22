<script setup lang="ts">
/**
 * The canvas the player paints on: the template until the first stroke, then the strokes.
 *
 * One pointer paints at a time, primary or not — a palm resting on „Signieren“ makes the painting
 * finger a secondary pointer. Every pointer on the canvas is reported through `touch`, painting or
 * not: the board's hold must not run while anything touches the canvas.
 *
 * A point is kept exactly as it will be sent: canvas units from the rect at the moment of the event
 * (a canvas that resizes mid-stroke still maps right), thinned and limited by `appendPoint`.
 */
import { computed, shallowRef, useTemplateRef } from 'vue'
import LayerCanvas from './LayerCanvas.vue'
import { showsTemplate } from './paintHistory'
import type { PaintState } from './paintHistory'
import type { CanvasLayer } from './render'
import { appendPoint, toUnits, usageOf } from './strokes'
import type { Usage } from './strokes'
import { MAX_STROKES } from './types'
import type { Stroke } from './types'

const props = defineProps<{
  width: number
  height: number
  brushes: number[]
  state: PaintState
  brush: number
  color: string
  templateSrc: string | null
  /** A press only reports `touch` and paints nothing. */
  locked: boolean
}>()

const emit = defineEmits<{ commit: [stroke: Stroke]; touch: [down: boolean] }>()

interface Painting {
  pointerId: number
  stroke: Stroke
  /** Points and path used so far, the canvas's committed strokes included. */
  usage: Usage
}

const field = useTemplateRef<HTMLDivElement>('field')
const layerCanvas = useTemplateRef<InstanceType<typeof LayerCanvas>>('layerCanvas')

/** Every pointer down on the canvas, the painting one among them. */
const pointers = new Set<number>()

/**
 * The stroke being painted. It lies on the layers from its first point, so a redraw (a resize)
 * keeps it; its points grow in place and are drawn piece by piece, not by a redraw per point.
 */
const painting = shallowRef<Painting | null>(null)

const layers = computed<CanvasLayer[]>(() => {
  const live = painting.value
  if (live !== null) return [{ kind: 'strokes', strokes: [...props.state.strokes, live.stroke] }]

  return showsTemplate(props.state)
    ? [{ kind: 'template' }]
    : [{ kind: 'strokes', strokes: props.state.strokes }]
})

function extend(live: Painting, event: PointerEvent): void {
  const rect = field.value?.getBoundingClientRect()
  const point = rect && toUnits(event.clientX, event.clientY, rect, props)
  if (!point) return

  const { points } = live.stroke
  if (appendPoint(points, point, live.usage)) {
    layerCanvas.value?.drawSegment(live.stroke, Math.max(0, points.length - 4))
  }
}

function onDown(event: PointerEvent): void {
  if (event.button !== 0) return
  try {
    // Lets the finger leave the canvas mid-stroke, and brings its `pointerup` back here.
    field.value?.setPointerCapture(event.pointerId)
  } catch {
    // Capture is an optimisation, not a precondition.
  }

  pointers.add(event.pointerId)
  emit('touch', true)
  if (props.locked || painting.value !== null || props.state.strokes.length >= MAX_STROKES) return

  const live: Painting = {
    pointerId: event.pointerId,
    stroke: { brush: props.brush, color: props.color, points: [] },
    usage: usageOf(props.state.strokes),
  }
  painting.value = live
  extend(live, event)
}

function onMove(event: PointerEvent): void {
  const live = painting.value
  if (live?.pointerId === event.pointerId) extend(live, event)
}

/** Release, cancel or lost capture: the stroke so far is committed — unless no point was kept. */
function onEnd(event: PointerEvent): void {
  const live = painting.value
  if (live?.pointerId === event.pointerId) {
    painting.value = null
    if (live.stroke.points.length > 0) emit('commit', live.stroke)
  }

  if (pointers.delete(event.pointerId) && pointers.size === 0) emit('touch', false)
}
</script>

<template>
  <div
    ref="field"
    data-test="paint-ratio-canvas"
    class="relative w-full touch-none overflow-hidden bg-white select-none [-webkit-touch-callout:none]"
    :style="{ aspectRatio: `${props.width} / ${props.height}` }"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onEnd"
    @pointercancel="onEnd"
    @lostpointercapture="onEnd"
  >
    <LayerCanvas
      ref="layerCanvas"
      class="absolute inset-0"
      :width="props.width"
      :height="props.height"
      :brushes="props.brushes"
      :layers="layers"
      :template-src="props.templateSrc"
    />
  </div>
</template>
