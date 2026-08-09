<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useEventListener } from '@vueuse/core'
import { bitmap, type Bitmap } from './font'
import {
  BOOT_DARK_MS,
  BOOT_HOLD_MS,
  BOOT_RESOLVE_AT_MS,
  CREATE_LEAD_MS,
  DOT_OFF,
  DOT_ON,
  FLIP_MS,
  PITCH,
  RADIUS,
  STAGGER_MS,
} from './board'
import { inBackground, prefersReducedMotion } from '@/ui/motion'

const props = defineProps<{ text: string; label: string }>()
const emit = defineEmits<{ phase: ['white' | 'live'] }>()

function uniform(b: Bitmap, on: boolean): Bitmap {
  return { cols: b.cols, rows: b.rows, on: b.on.map(() => on) }
}

const svg = useTemplateRef<SVGSVGElement>('svg')
const bm = computed(() => bitmap(props.text))
const phase = ref<'dark' | 'white' | 'live'>(prefersReducedMotion() ? 'live' : 'dark')
const shown = computed(() =>
  phase.value === 'live' ? bm.value : uniform(bm.value, phase.value === 'white'),
)
const gap = PITCH - 2 * RADIUS
const viewBox = computed(() => `0 0 ${bm.value.cols * PITCH - gap} ${bm.value.rows * PITCH - gap}`)
const dots = computed(() =>
  shown.value.on.map((on, i) => ({
    on,
    cx: (i % shown.value.cols) * PITCH + RADIUS,
    cy: Math.floor(i / shown.value.cols) * PITCH + RADIUS,
  })),
)

interface WaveColumn {
  /** When this column starts moving, in ms after its wave began. */
  start: number
  dots: { index: number; circle: SVGCircleElement; from: string }[]
}

/**
 * Flips still rolling: the columns each one has not handed to the browser yet, and the clock its
 * `start` values are measured from. More than one at a time, because a value arriving mid-reveal
 * schedules its own dots without disturbing the reveal already under way.
 */
let waves: { columns: WaveColumn[]; began: number }[] = []
let waveRaf = 0

/** Every dot the running waves are holding at its pre-flip colour. */
function heldDots(): Map<number, { circle: SVGCircleElement; from: string }> {
  const held = new Map<number, { circle: SVGCircleElement; from: string }>()
  for (const wave of waves) {
    for (const column of wave.columns) {
      for (const dot of column.dots) held.set(dot.index, dot)
    }
  }
  return held
}

/**
 * Drops every running wave and hands the dots they were holding back to the render.
 *
 * A held dot's `fill` attribute was written straight to the DOM, which Vue's patch does not know
 * about: it diffs against its own previous vnode, so for a dot whose bound colour did not change it
 * writes nothing and the hold would simply stay on screen. `shown` is what the template renders
 * right now, so restoring from it is what puts the two back in agreement.
 */
function releaseWaves(): void {
  cancelAnimationFrame(waveRaf)
  waveRaf = 0
  for (const [index, dot] of heldDots()) {
    dot.circle.setAttribute('fill', (shown.value.on[index] ?? false) ? DOT_ON : DOT_OFF)
  }
  waves = []
}

function flip(prev: Bitmap, next: Bitmap): void {
  if (prev.cols !== next.cols || prefersReducedMotion() || inBackground()) return
  const circles = svg.value?.querySelectorAll('circle')
  // happy-dom has no Web Animations API; the resting colour is already correct without it. Checked
  // up front rather than per dot, so a board without one is never left holding a pre-flip colour.
  if (!circles || typeof circles[0]?.animate !== 'function') return

  // A dot a running wave still owes a flip to is left to that wave — it resolves to whatever the
  // board reads when its column's turn comes, so a value arriving mid-reveal changes what gets
  // revealed rather than cutting the reveal short. Its hold is re-asserted, because the patch that
  // brought us here has just written the new colour over it wherever that colour changed.
  const held = heldDots()
  for (const dot of held.values()) dot.circle.setAttribute('fill', dot.from)

  const changed: number[] = []
  for (let i = 0; i < next.on.length; i++) {
    if (held.has(i)) continue
    if ((prev.on[i] ?? false) !== (next.on[i] ?? false)) changed.push(i)
  }
  if (changed.length === 0) return

  // The wave starts at the rightmost column that changed and runs leftward, which is what a
  // right-aligned readout wants: its low-order end changes most often, and it leads instead of
  // trailing. Measured from that column and not from the board's edge — otherwise a group sitting
  // far right waits out every unchanged column to its left before anything moves.
  const lead = changed.reduce((rightmost, i) => Math.max(rightmost, i % next.cols), 0)

  const byColumn = new Map<number, WaveColumn>()
  for (const i of changed) {
    const circle = circles[i]
    if (!circle) continue
    const from = (prev.on[i] ?? false) ? DOT_ON : DOT_OFF
    const col = i % next.cols
    const start = (lead - col) * STAGGER_MS
    const column = byColumn.get(col) ?? { start, dots: [] }
    column.dots.push({ index: i, circle, from })
    byColumn.set(col, column)
    // The render is already showing the resolved colour, while this dot's animation — which used to
    // hold the pre-state through `fill: 'backwards'` from the first frame — does not exist yet. So
    // the hold has to be written out: without it the left of the board shows its digits before the
    // wave ever reaches it, and the flip reads as a correction instead of a reveal.
    circle.setAttribute('fill', from)
  }

  waves.push({
    columns: [...byColumn.values()].sort((a, b) => a.start - b.start),
    began: performance.now(),
  })
  createDueColumns()
}

function createDueColumns(): void {
  const at = performance.now()
  for (const wave of waves) {
    const elapsed = at - wave.began
    while (wave.columns.length > 0 && wave.columns[0]!.start <= elapsed + CREATE_LEAD_MS) {
      const column = wave.columns.shift()!
      for (const dot of column.dots) {
        // Read now, not when the wave was built: a column that has waited out a value change flips
        // to what the board reads today. A dot the change has brought back to the colour it is
        // already being held at has nothing left to flip.
        const to = (shown.value.on[dot.index] ?? false) ? DOT_ON : DOT_OFF
        if (to === dot.from) continue
        dot.circle.animate(
          [
            { transform: 'scaleY(1)', fill: dot.from },
            { transform: 'scaleY(0.12)', fill: dot.from, offset: 0.49 },
            { transform: 'scaleY(0.12)', fill: to, offset: 0.5 },
            { transform: 'scaleY(1)', fill: to },
          ],
          {
            duration: FLIP_MS,
            // What creating late costs is paid out of the delay, so the column still starts on the
            // millisecond it always did — the deferral is invisible.
            delay: Math.max(0, column.start - elapsed),
            easing: 'ease-in-out',
            fill: 'backwards',
          },
        )
        dot.circle.setAttribute('fill', to)
      }
    }
  }

  waves = waves.filter((wave) => wave.columns.length > 0)
  // Cancel first: a flip starting mid-reveal calls this straight out of the watcher, while the
  // running wave's frame is already booked, and two loops would then create every column twice.
  cancelAnimationFrame(waveRaf)
  waveRaf = waves.length > 0 ? requestAnimationFrame(createDueColumns) : 0
}

// The two timers of the switch-on, which runs once per mount.
const bootTimers: ReturnType<typeof setTimeout>[] = []

/**
 * The pending relight, of which there is at most one.
 *
 * A single handle rather than another entry on `bootTimers`: that array is only ever emptied at
 * unmount, so a board that relights repeatedly — every tap on the header cycles the base unit, and
 * each cycle changes the geometry — left a spent handle behind on every one of them, for as long as
 * the page stayed open.
 */
let relightTimer: ReturnType<typeof setTimeout> | undefined

function goWhite(): void {
  // A wave still running here belongs to the board that is being switched off. Its dots are held by
  // index, and the relight is the one moment that index can come to mean a different dot — a board
  // that gained a digit reuses the same circles for a different part of the readout.
  releaseWaves()
  phase.value = 'white'
  emit('phase', 'white')
}

function resolveFromWhite(): void {
  const prev = shown.value
  phase.value = 'live'
  emit('phase', 'live')
  void nextTick(() => flip(prev, shown.value))
}

watch(
  bm,
  (next, prev) => {
    if (phase.value !== 'live') return
    if (prev.cols === next.cols) {
      flip(prev, next)
      return
    }
    // A different geometry cannot be flipped dot by dot: dot i no longer means what it meant. So
    // the board switches itself on again — white, hold, roll in — and the size change happens
    // while nothing is legible. Reduced motion gets the bare swap, as at mount, and so does a
    // background tab: a relight nobody can see is three renders and a timer for nothing.
    if (prefersReducedMotion() || inBackground()) return
    goWhite()
    // Cleared before it is replaced, so "at most one" holds by construction rather than by an
    // argument about the phase guard above.
    clearTimeout(relightTimer)
    relightTimer = setTimeout(resolveFromWhite, BOOT_HOLD_MS)
  },
  { flush: 'post' },
)

// The dots a wave has not reached yet are held at their pre-flip colour by hand, and the wave that
// would resolve them runs on `requestAnimationFrame` — which going to the background has just
// stopped. Releasing them hands the hold back to the render, so the board is legible the moment the
// reader returns instead of frozen half way through a flip.
useEventListener(document, 'visibilitychange', () => {
  if (inBackground()) releaseWaves()
})

onMounted(() => {
  if (phase.value === 'live') {
    emit('phase', 'live')
    return
  }
  bootTimers.push(
    // The white-up is a phase change, deliberately with no flip: every dot changes at once, so a
    // simultaneous kick is not readable as movement — and a wave across a board where *every*
    // column changes would double the animation count of the switch-on for nothing anyone can see.
    // The colour change alone is the whole effect.
    setTimeout(goWhite, BOOT_DARK_MS),
    setTimeout(resolveFromWhite, BOOT_RESOLVE_AT_MS),
  )
})

onBeforeUnmount(() => {
  for (const timer of bootTimers) clearTimeout(timer)
  clearTimeout(relightTimer)
  releaseWaves()
})
</script>

<template>
  <svg
    ref="svg"
    :viewBox="viewBox"
    class="block"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    :aria-label="label"
  >
    <circle
      v-for="(dot, i) in dots"
      :key="i"
      :cx="dot.cx"
      :cy="dot.cy"
      :r="RADIUS"
      :fill="dot.on ? DOT_ON : DOT_OFF"
      class="origin-center [transform-box:fill-box]"
    />
  </svg>
</template>
