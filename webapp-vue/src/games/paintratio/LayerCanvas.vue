<script setup lang="ts">
/**
 * An off-white canvas that draws its layers in order, later over earlier: the template picture, or a
 * set of strokes. Display only — nothing is ever read back from it; the strokes are the truth.
 *
 * The backing store follows the CSS size × `devicePixelRatio`, so strokes stay sharp on any phone.
 * Without a 2D context (happy-dom) it draws nothing.
 */
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { CANVAS_GROUND, drawSegment as paintSegment, drawStrokes } from './render'
import type { CanvasLayer } from './render'
import type { Stroke } from './types'

const props = defineProps<{
  /** The canvas in units. */
  width: number
  height: number
  brushes: number[]
  layers: CanvasLayer[]
  templateSrc: string | null
}>()

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const picture = useTemplateRef<HTMLImageElement>('picture')
const pictureReady = ref(false)
let ctx: CanvasRenderingContext2D | null = null
let observer: ResizeObserver | null = null

/** Canvas pixels per unit. */
function scale(): number {
  return (canvas.value?.width ?? 0) / props.width
}

function redraw(): void {
  const el = canvas.value
  if (ctx === null || !el) return

  ctx.fillStyle = CANVAS_GROUND
  ctx.fillRect(0, 0, el.width, el.height)

  for (const layer of props.layers) {
    if (layer.kind === 'strokes') drawStrokes(ctx, layer.strokes, props.brushes, scale())
    else if (pictureReady.value && picture.value) {
      ctx.drawImage(picture.value, 0, 0, el.width, el.height)
    }
  }
}

/** Resizing the backing store clears it, so every fit redraws. */
function fit(): void {
  const el = canvas.value
  if (!el) return

  const rect = el.getBoundingClientRect()
  const ratio = window.devicePixelRatio || 1
  el.width = Math.round(rect.width * ratio)
  el.height = Math.round(rect.height * ratio)
  redraw()
}

/** Paints [stroke] from flat index [from] on, over whatever is drawn — a stroke as it grows. */
function drawSegment(stroke: Stroke, from: number): void {
  if (ctx !== null) paintSegment(ctx, stroke, from, props.brushes, scale())
}

defineExpose({ drawSegment })

onMounted(() => {
  ctx = canvas.value?.getContext('2d') ?? null
  fit()

  if (typeof ResizeObserver === 'function' && canvas.value) {
    observer = new ResizeObserver(fit)
    observer.observe(canvas.value)
  }
})

onBeforeUnmount(() => observer?.disconnect())

watch(
  () => props.templateSrc,
  () => (pictureReady.value = false),
)

watch(
  [() => props.layers, () => props.brushes, () => props.width, () => props.height, pictureReady],
  redraw,
)
</script>

<template>
  <div>
    <canvas ref="canvas" class="block size-full" />
    <!-- The template's source for `drawImage`; never shown itself. -->
    <img
      v-if="props.templateSrc"
      ref="picture"
      :key="props.templateSrc"
      :src="props.templateSrc"
      alt=""
      hidden
      @load="pictureReady = true"
    />
  </div>
</template>
