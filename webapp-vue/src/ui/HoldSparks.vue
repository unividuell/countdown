<script setup lang="ts">
/**
 * Sparks flung off a `HoldButton`'s ring while it charges: from anywhere on the part already
 * filled, so few at first and from one side, then more and from all around. The ring's own ink,
 * so they neither glow away on a light card nor add a colour to a board that is about colour.
 *
 * A canvas larger than the button, centred on it; it takes no pointer.
 */
import { onBeforeUnmount, useTemplateRef, watch } from 'vue'
import { sparkRate } from '@/ui/charge'
import { inBackground, prefersReducedMotion } from '@/ui/motion'

const props = defineProps<{
  /** How full the ring is, 0 … 1. */
  ring: number
  /** Only a rising ring throws sparks: the run back after a release does not. */
  active: boolean
  shape: 'round' | 'square'
}>()

/** The canvas' side in button sides: room for a spark to fly and fade. */
const SPAN = 2.5
/** The ring's outer edge, in button halves (`HoldButton`'s `-inset-[6.25%]`). */
const RING_REACH = 1.125
/** A spark leaves the ring within this angle of straight out. */
const SPREAD_RAD = 0.6
const LIFE_MS = { min: 300, spread: 450 }
/** Ring radii per second. */
const SPEED = { min: 0.4, spread: 1.1 }
/** A frame after a stall must not throw a second's worth of sparks at once. */
const MAX_FRAME_MS = 50

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  born: number
  life: number
}

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
let ctx: CanvasRenderingContext2D | null = null
/** CSS pixels per side. */
let size = 0
let ink = '#000'
let sparks: Spark[] = []
let frame = 0
let last = -1
/** Sparks owed: the rate times the time, with its fraction carried over. */
let owed = 0

/** Sizes the canvas to its box and the screen's pixels; false where there is nothing to draw on. */
function prepare(): boolean {
  const el = canvas.value
  if (!el || prefersReducedMotion() || inBackground()) return false

  ctx = el.getContext('2d')
  if (ctx === null) return false

  size = el.getBoundingClientRect().width
  const scale = window.devicePixelRatio || 1
  el.width = Math.round(size * scale)
  el.height = Math.round(size * scale)
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ink = getComputedStyle(el).color

  return size > 0
}

function throwSpark(now: number): void {
  // Clockwise from the top, like the ring fills.
  const angle = Math.random() * props.ring * 2 * Math.PI
  const dx = Math.sin(angle)
  const dy = -Math.cos(angle)

  const reach = (size / SPAN / 2) * RING_REACH
  // A square's edge lies further out towards its corners.
  const edge = props.shape === 'square' ? reach / Math.max(Math.abs(dx), Math.abs(dy)) : reach

  const heading = angle + (Math.random() * 2 - 1) * SPREAD_RAD
  const speed = (reach * (SPEED.min + Math.random() * SPEED.spread)) / 1000

  sparks.push({
    x: size / 2 + dx * edge,
    y: size / 2 + dy * edge,
    vx: Math.sin(heading) * speed,
    vy: -Math.cos(heading) * speed,
    born: now,
    life: LIFE_MS.min + Math.random() * LIFE_MS.spread,
  })
}

function draw(now: number): void {
  if (ctx === null) return

  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = ink
  for (const spark of sparks) {
    const t = now - spark.born
    const left = 1 - t / spark.life

    // Fades and shrinks as it flies.
    ctx.globalAlpha = left
    ctx.beginPath()
    ctx.arc(spark.x + spark.vx * t, spark.y + spark.vy * t, 1 + 2 * left, 0, 2 * Math.PI)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function tick(now: number): void {
  frame = 0
  const elapsed = last < 0 ? 0 : Math.min(now - last, MAX_FRAME_MS)
  last = now

  if (props.active) {
    owed += (sparkRate(props.ring) * elapsed) / 1000
    for (; owed >= 1; owed--) throwSpark(now)
  }

  sparks = sparks.filter((spark) => now - spark.born < spark.life)
  draw(now)

  if (props.active || sparks.length > 0) frame = requestAnimationFrame(tick)
  else last = -1
}

watch(
  () => props.active,
  (active) => {
    if (!active || frame !== 0 || !prepare()) return

    owed = 0
    frame = requestAnimationFrame(tick)
  },
)

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame)
})
</script>

<template>
  <canvas
    ref="canvas"
    data-test="hold-sparks"
    aria-hidden="true"
    class="pointer-events-none absolute -top-[75%] -left-[75%] size-[250%] text-on-surface"
  />
</template>
