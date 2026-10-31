<script setup lang="ts">
/**
 * Peilung's field on a canvas. It draws and reports taps, nothing else: what a tap means is the
 * board's business (`flow.ts`). Layers, bottom up:
 *
 *   ground · dot grid · [tolerance circles] · rings · waves · loading pulse · ping centres
 *   · [clips, noises, links, other pins] · pins · sparks
 *
 * Bracketed layers belong to the reveal. With a `solution` the field is a map and takes no taps —
 * a finger there scrolls the page.
 *
 * `covered` lays a button over the field, and only its click asks to `start`: iOS counts a touch
 * as a gesture from its end on, so a `pointerdown` could not start the audio graph.
 *
 * A wave is drawn from its `startMs`, on the clock of `performance.now()` and of a tap's
 * `event.timeStamp`. The canvas animates by `requestAnimationFrame` only while something moves.
 * The backing store follows the CSS size × `devicePixelRatio`; without a 2D context (happy-dom) it
 * draws nothing.
 */
import { computed, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import type { Wave } from './flow'
import { toCell, waveRadius } from './sonar'
import type { Cell, EchoLocateSolution, NoiseKind, Point } from './types'

const props = defineProps<{
  /** How many sayings hide in the field; the cover names them. */
  clips?: number
  grid: number
  /** Cells per second. */
  speed: number
  /** Cells a wave travels. */
  reach: number
  waves: Wave[]
  /** `rings[i]` are the radii marked around `waves[i]`. */
  rings: number[][]
  pins: Point[]
  /** A ping whose answer is out: it pulses until its wave starts. */
  pending: Point | null
  /** Before the first tap, while the sound is locked. */
  covered: boolean
  /** The cover takes no click. */
  disabled?: boolean
  solution?: EchoLocateSolution | null
  /** Everyone else's pins on the map, dimmed. */
  otherPins?: Point[]
  /** A pin and the target cell it was matched with. */
  links?: [Point, Cell][]
}>()

/** `tMs` is the event's `timeStamp`: when the finger came down, not when the handler ran. */
const emit = defineEmits<{ tap: [at: Point, tMs: number]; start: [] }>()

const NOISE_LETTER: Record<NoiseKind, string> = {
  BIRDS: 'V',
  BROOK: 'B',
  COW: 'K',
  WIND: 'W',
  RAIN: 'R',
}

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  born: number
  life: number
  hue: number
}

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
let ctx: CanvasRenderingContext2D | null = null
let observer: ResizeObserver | null = null
/** CSS pixels per side. */
let size = 0
let sparks: Spark[] = []
let frame = 0

const interactive = computed(() => !props.solution)

/** A burst flung outward from the tap, in CSS pixels. It says nothing about the sound. */
function throwSparks(x: number, y: number): void {
  const now = performance.now()
  for (let i = 0; i < 14; i++) {
    const angle = Math.random() * 2 * Math.PI
    const speed = 0.03 + Math.random() * 0.1
    sparks.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      born: now,
      life: 400 + Math.random() * 600,
      hue: 180 + Math.random() * 120,
    })
  }
  animate()
}

function onDown(event: PointerEvent): void {
  const el = canvas.value
  if (!el || !interactive.value) return

  const rect = el.getBoundingClientRect()
  throwSparks(event.clientX - rect.left, event.clientY - rect.top)
  emit('tap', toCell(event.clientX, event.clientY, rect, props.grid), event.timeStamp)
}

function moving(now: number): boolean {
  const travelMs = (props.reach / props.speed) * 1000

  return (
    sparks.length > 0 ||
    props.pending !== null ||
    props.waves.some((wave) => wave.startMs !== null && now < wave.startMs + travelMs)
  )
}

function animate(): void {
  if (ctx !== null && frame === 0) frame = requestAnimationFrame(tick)
}

function tick(now: number): void {
  frame = 0
  sparks = sparks.filter((spark) => now - spark.born < spark.life)
  draw(now)
  if (moving(now)) animate()
}

function draw(now = performance.now()): void {
  if (ctx === null) return
  const c = ctx
  const cell = size / props.grid
  const at = (v: number): number => v * cell
  const circle = (p: Point, radius: number): void => {
    c.beginPath()
    c.arc(at(p.x), at(p.y), radius, 0, 2 * Math.PI)
  }

  // A dark surface, faintly lit from within.
  const ground = c.createRadialGradient(size * 0.4, size * 0.35, 0, size / 2, size / 2, size * 0.75)
  ground.addColorStop(0, '#1e1b4b')
  ground.addColorStop(1, '#020617')
  c.fillStyle = ground
  c.fillRect(0, 0, size, size)

  // Dots at the cell centres: enough to aim, not enough to count.
  c.fillStyle = 'rgba(255,255,255,0.07)'
  for (let row = 0; row < props.grid; row++) {
    for (let col = 0; col < props.grid; col++) {
      c.fillRect(at(col + 0.5) - 0.75, at(row + 0.5) - 0.75, 1.5, 1.5)
    }
  }

  if (props.solution) drawTolerance(c, cell, props.solution)

  // The player's rings, all alike: a ring does not say which clip it meant.
  c.lineWidth = 1.5
  c.strokeStyle = 'rgba(165,180,252,0.45)'
  props.rings.forEach((radii, ping) => {
    const centre = props.waves[ping]?.at
    if (!centre) return

    for (const radius of radii) {
      circle(centre, radius * cell)
      c.stroke()
    }
  })
  c.lineWidth = 1

  // A wave grows to its reach and fades as it goes; the reach dashed meanwhile.
  for (const wave of props.waves) {
    if (wave.startMs === null) continue
    const r = waveRadius(wave.startMs, now, props.speed, props.reach)
    if (r === null) continue
    const fade = 1 - r / props.reach

    circle(wave.at, props.reach * cell)
    c.setLineDash([3, 6])
    c.strokeStyle = 'rgba(255,255,255,0.12)'
    c.stroke()
    c.setLineDash([])

    circle(wave.at, r * cell)
    c.lineWidth = 6
    c.strokeStyle = `rgba(103,232,249,${0.15 * fade})`
    c.stroke()
    c.lineWidth = 1.5
    c.strokeStyle = `rgba(165,243,252,${0.3 + 0.6 * fade})`
    c.stroke()
    c.lineWidth = 1
  }

  // The open ping breathes at the tap, twice a second.
  if (props.pending) {
    const phase = (Math.sin((now / 500) * 2 * Math.PI) + 1) / 2
    circle(props.pending, cell * (0.4 + 0.5 * phase))
    c.lineWidth = 2
    c.strokeStyle = `rgba(165,243,252,${0.4 + 0.5 * phase})`
    c.stroke()
    c.lineWidth = 1
  }

  // Ping centres stay, numbered: the player's own moves.
  c.font = `600 ${Math.max(9, cell * 0.6)}px system-ui`
  c.textAlign = 'left'
  c.textBaseline = 'bottom'
  c.strokeStyle = 'rgba(165,243,252,0.8)'
  c.fillStyle = 'rgba(165,243,252,0.8)'
  props.waves.forEach((wave, i) => {
    const x = at(wave.at.x)
    const y = at(wave.at.y)
    c.beginPath()
    c.moveTo(x - 5, y)
    c.lineTo(x + 5, y)
    c.moveTo(x, y - 5)
    c.lineTo(x, y + 5)
    c.stroke()
    c.fillText(String(i + 1), x + 4, y - 3)
  })

  if (props.solution) drawSolution(c, cell, props.solution)

  for (const pin of props.otherPins ?? []) {
    circle(pin, Math.max(4, cell * 0.3))
    c.fillStyle = 'rgba(251,191,36,0.45)'
    c.fill()
  }

  for (const pin of props.pins) {
    circle(pin, Math.max(6, cell * 0.45))
    c.fillStyle = '#fbbf24'
    c.fill()
    c.strokeStyle = '#78350f'
    c.lineWidth = 2
    c.stroke()
    c.lineWidth = 1
  }

  c.globalCompositeOperation = 'lighter'
  for (const spark of sparks) {
    const age = (now - spark.born) / spark.life
    const t = now - spark.born
    c.fillStyle = `hsla(${spark.hue}, 90%, 70%, ${1 - age})`
    c.beginPath()
    c.arc(spark.x + spark.vx * t, spark.y + spark.vy * t, 1 + 2.5 * (1 - age), 0, 2 * Math.PI)
    c.fill()
  }
  c.globalCompositeOperation = 'source-over'
}

/** Phase one: the circle around each clip's centre that a pin must land in. */
function drawTolerance(
  c: CanvasRenderingContext2D,
  cell: number,
  solution: EchoLocateSolution,
): void {
  const radius = solution.toleranceRadius
  if (radius === null) return

  c.fillStyle = 'rgba(52,211,153,0.15)'
  c.strokeStyle = 'rgba(52,211,153,0.5)'
  for (const target of solution.targets) {
    c.beginPath()
    c.arc((target.col + 0.5) * cell, (target.row + 0.5) * cell, radius * cell, 0, 2 * Math.PI)
    c.fill()
    c.stroke()
  }
}

/** The clips green, the noises by their letter, and a dashed line from each linked pin. */
function drawSolution(
  c: CanvasRenderingContext2D,
  cell: number,
  solution: EchoLocateSolution,
): void {
  const centre = (v: number): number => (v + 0.5) * cell

  c.font = `700 ${Math.max(10, cell * 0.7)}px system-ui`
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillStyle = 'rgba(248,113,113,0.9)'
  for (const noise of solution.noises) {
    c.fillText(NOISE_LETTER[noise.kind], centre(noise.cell.col), centre(noise.cell.row))
  }

  c.fillStyle = 'rgba(52,211,153,0.9)'
  for (const target of solution.targets) {
    c.beginPath()
    c.arc(centre(target.col), centre(target.row), Math.max(8, cell * 0.6), 0, 2 * Math.PI)
    c.fill()
  }

  c.setLineDash([4, 4])
  c.strokeStyle = 'rgba(251,191,36,0.8)'
  for (const [pin, target] of props.links ?? []) {
    c.beginPath()
    c.moveTo(pin.x * cell, pin.y * cell)
    c.lineTo(centre(target.col), centre(target.row))
    c.stroke()
  }
  c.setLineDash([])
}

/** Resizing the backing store clears it, so every fit redraws. */
function fit(): void {
  const el = canvas.value
  if (!el) return

  const ratio = window.devicePixelRatio || 1
  size = el.getBoundingClientRect().width
  el.width = Math.round(size * ratio)
  el.height = Math.round(size * ratio)
  ctx?.setTransform(ratio, 0, 0, ratio, 0, 0)
  draw()
}

onMounted(() => {
  ctx = canvas.value?.getContext('2d') ?? null
  fit()

  if (typeof ResizeObserver === 'function' && canvas.value) {
    observer = new ResizeObserver(fit)
    observer.observe(canvas.value)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  if (frame !== 0) cancelAnimationFrame(frame)
})

watch(
  [
    () => props.waves,
    () => props.rings,
    () => props.pins,
    () => props.pending,
    () => props.solution,
    () => props.otherPins,
    () => props.links,
  ],
  () => {
    draw()
    animate()
  },
)
</script>

<template>
  <div class="relative">
    <canvas
      ref="canvas"
      role="img"
      aria-label="Sonarfeld"
      class="block aspect-square w-full rounded-lg select-none"
      :class="{ 'touch-none': interactive }"
      @pointerdown="onDown"
    />
    <button
      v-if="props.covered"
      type="button"
      :disabled="props.disabled"
      class="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg bg-black/40 text-lg font-semibold text-white focus-visible:outline-2 focus-visible:-outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
      @click="emit('start')"
    >
      <span v-if="props.clips" class="text-base font-normal text-white/80">
        {{ props.clips === 1 ? '1 Spruch' : `${props.clips} Sprüche` }}
      </span>
      <span>Antippen zum Starten</span>
    </button>
  </div>
</template>
