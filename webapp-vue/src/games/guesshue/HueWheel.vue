<script setup lang="ts">
/**
 * The colour wheel. Three layers: a static ring, a rotating layer carrying the knob, and a slot in
 * the middle for whatever confirms.
 *
 * Angles run clockwise from the top — the same origin and direction as CSS `conic-gradient`, so
 * nothing here needs an offset. The pointer maths lives in `geometry.ts`, because happy-dom
 * computes no layout and it could not be tested from in here.
 *
 * Written rather than pulled in: the original reached into `@radial-color-picker`'s DOM by class
 * name and overrode its internals in CSS. Its ideas are kept — one `role="slider"` for the whole
 * wheel, the key map, grab-anywhere, the rotating layer — its code is not.
 */
import type { CSSProperties } from 'vue'
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { angleFromPoint, hueName, radiusFraction, wrap360 } from './geometry'
import {
  BAND_INNER_FRACTION,
  BOOT_SWEEP_MS,
  BOOT_TRAIL_MS,
  CENTRE_HOLD_FRACTION,
  KNOB_TRACK_FRACTION,
} from './wheel'

const props = defineProps<{
  hue: number
  /** 0 … 1, as the payload carries them. */
  saturation: number
  lightness: number
  disabled: boolean
}>()

const emit = defineEmits<{ 'update:hue': [number]; 'boot-done': [] }>()

const root = useTemplateRef<HTMLDivElement>('root')

/**
 * What a screen reader is told. Rounded, because the fractions a drag produces help nobody read
 * aloud — and folded onto the circle **after** rounding, so 359.6 announces 0 rather than a 360
 * that sits one past `aria-valuemax`. The guess itself stays exact.
 */
const announcedHue = computed(() => Math.round(wrap360(props.hue)) % 360)

/** During the sweep the rotator follows this instead of `hue`; `null` once the wheel is live. */
const sweepKnob = ref<number | null>(null)
/** How much of the ring is painted, in degrees; 360 once the wheel is live. */
const painted = ref(0)
/** Where the ring starts opening — the angle the wheel was handed on mount. */
const sweepFrom = ref(0)
const dragging = ref(false)
let frame = 0

const KEY_STEPS: Record<string, number> = {
  ArrowUp: 1,
  ArrowRight: 1,
  ArrowDown: -1,
  ArrowLeft: -1,
  PageUp: 10,
  PageDown: -10,
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function inBackground(): boolean {
  return document.hidden
}

/** Cubic, written as multiplication — `**` is fine here, but this reads as what it is. */
function easeOut(t: number): number {
  const u = 1 - t
  return 1 - u * u * u
}

function finishSweep(): void {
  if (frame) cancelAnimationFrame(frame)
  frame = 0
  if (sweepKnob.value === null && painted.value === 360) return
  sweepKnob.value = null
  painted.value = 360
  emit('boot-done')
}

/**
 * The knob starts where it will end and runs exactly one full turn; behind it the ring opens as a
 * mask that trails by [BOOT_TRAIL_MS]. That lag is the whole effect — it makes the knob a comet
 * head and the ring its trail. Start and end angle are the same, but differ per round, so the
 * place where the ring opens moves with the round.
 */
function runSweep(): void {
  let started = -1
  const from = sweepFrom.value

  function step(now: number): void {
    if (started < 0) started = now
    const elapsed = now - started
    const knob = Math.min(1, elapsed / BOOT_SWEEP_MS)
    const trail = Math.min(1, Math.max(0, (elapsed - BOOT_TRAIL_MS) / BOOT_SWEEP_MS))

    sweepKnob.value = wrap360(from + easeOut(knob) * 360)
    painted.value = easeOut(trail) * 360

    if (trail >= 1) {
      finishSweep()
      return
    }
    frame = requestAnimationFrame(step)
  }

  frame = requestAnimationFrame(step)
}

onMounted(() => {
  sweepFrom.value = props.hue
  if (prefersReducedMotion() || inBackground() || typeof requestAnimationFrame !== 'function') {
    finishSweep()
    return
  }
  runSweep()
})

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame)
})

function commit(next: number): void {
  emit('update:hue', wrap360(next))
}

function onPointerDown(event: PointerEvent): void {
  if (props.disabled) return
  const el = root.value
  if (!el) return
  const box = el.getBoundingClientRect()
  const fraction = radiusFraction(event.clientX, event.clientY, box)
  // Only the rainbow band may start a drag: inside it is empty (and, incidentally, where the
  // confirm button sits), and past the circle's edge is the square root element's own corners,
  // which reach ~1.41. This gate applies only here, to starting a drag — once one is running,
  // [onPointerMove] follows the pointer regardless of radius, because a knob already grabbed must
  // keep following the hand that grabbed it.
  if (fraction < BAND_INNER_FRACTION || fraction > 1) return
  // Grabbing the wheel wins over its own entrance; dragging against a running animation is worse
  // than losing the last frames of it.
  finishSweep()
  try {
    // The browser rejects capture for a pointer it is not tracking (`NotFoundError`) — rare, but
    // fatal if uncaught: the throw would abort this handler before `dragging` is ever set, so the
    // wheel would silently stop responding to that pointer. Dragging without capture is only worse
    // at the edges; not dragging at all is broken.
    el.setPointerCapture(event.pointerId)
  } catch {
    // Capture is an optimisation, not a precondition — fall through and drag anyway.
  }
  dragging.value = true
  commit(angleFromPoint(event.clientX, event.clientY, box))
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging.value) return
  const el = root.value
  if (!el) return
  const box = el.getBoundingClientRect()
  // Pointer capture (taken in [onPointerDown]) is what still delivers these moves once the
  // pointer has left the element — on a phone the finger inevitably drifts inward or outward
  // while turning, and the knob has to follow it there too, not just on the band it started on.
  // The one exception is the centre-stability guard: too close to it and `atan2` turns a
  // millimetre of movement into a ninety-degree jump, so the angle holds its last value instead.
  if (radiusFraction(event.clientX, event.clientY, box) < CENTRE_HOLD_FRACTION) return
  commit(angleFromPoint(event.clientX, event.clientY, box))
}

function onPointerUp(event: PointerEvent): void {
  if (!dragging.value) return
  dragging.value = false
  if (root.value?.hasPointerCapture(event.pointerId)) {
    root.value.releasePointerCapture(event.pointerId)
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (props.disabled) return
  // Space and Enter belong to whatever sits in the centre slot; they must pass through untouched.
  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    finishSweep()
    commit(event.key === 'Home' ? 0 : 359)
    return
  }
  const step = KEY_STEPS[event.key]
  if (step === undefined) return
  event.preventDefault()
  finishSweep()
  commit(props.hue + step)
}

const knobAngle = computed(() => sweepKnob.value ?? props.hue)

/** The knob's own size, as a fraction of the wheel — kept beside the track math it feeds. */
const KNOB_SIZE_FRACTION = 0.09

/**
 * `top`, as a % of the wheel's own box, that puts the knob's *centre* on
 * [KNOB_TRACK_FRACTION] — not its top edge, which is what the raw CSS property addresses, hence
 * subtracting half the knob's own size.
 */
const KNOB_TOP_PERCENT = 50 * (1 - KNOB_TRACK_FRACTION) - (KNOB_SIZE_FRACTION * 100) / 2

const ringStyle = computed(() => {
  const s = `${props.saturation * 100}%`
  const l = `${props.lightness * 100}%`
  const sweepMask =
    painted.value >= 360
      ? undefined
      : `conic-gradient(from ${sweepFrom.value}deg, #000 0deg ${painted.value}deg, transparent 0deg)`
  // The band itself: everything inside [BAND_INNER_FRACTION] is cut away, turning the disc into a
  // ring. Composed with the sweep mask above rather than replacing it, so the entrance still paints
  // the band progressively instead of revealing a full disc that only narrows once it is done.
  const bandMask = `radial-gradient(closest-side, transparent ${BAND_INNER_FRACTION * 100 - 1}%, #000 ${BAND_INNER_FRACTION * 100}%)`
  const mask = sweepMask ? `${sweepMask}, ${bandMask}` : bandMask
  return {
    // An array of values is Vue's fallback idiom: it writes them in order and the last one the
    // browser accepts survives. Without hue interpolation the stepped ring stands — which is what
    // the original shipped, only with nine stops instead of thirteen, and it banded visibly.
    // csstype (which Vue's CSSProperties is built on) has no notion of this idiom, so the array
    // needs the cast — the runtime behaviour is Vue's, not a workaround.
    backgroundImage: [
      `conic-gradient(${Array.from({ length: 13 }, (_, i) => `hsl(${i * 30} ${s} ${l})`).join(',')})`,
      `conic-gradient(in hsl longer hue, hsl(0 ${s} ${l}), hsl(360 ${s} ${l}))`,
    ] as unknown as string,
    mask,
    WebkitMask: mask,
    // Two mask layers default to `add` (a union) — `intersect` is what turns "painted so far" AND
    // "inside the band" into the actual visible region; without it the sweep would go on painting
    // the disc's dead centre too, band or no band. csstype has no `maskComposite` entry either.
    ...(sweepMask
      ? ({
          maskComposite: 'intersect',
          WebkitMaskComposite: 'source-in',
        } as unknown as CSSProperties)
      : {}),
    cursor: dragging.value ? 'grabbing' : 'grab',
  } satisfies CSSProperties
})

const rotatorStyle = computed(() => ({
  transform: `rotate(${knobAngle.value}deg)`,
  willChange: dragging.value || sweepKnob.value !== null ? 'transform' : undefined,
}))
</script>

<template>
  <div class="w-full">
    <!--
      `touch-none` and `select-none` were already here — a long press on the wheel is a normal
      part of playing, so nothing under it may be selectable or raise an iOS callout.
      `@contextmenu.prevent` is the other half: without it, the same long press can pop the
      browser's context menu, which is exactly the failure mode the confirm button had to be
      hardened against too.
    -->
    <div
      ref="root"
      data-test="hue-wheel"
      role="slider"
      aria-label="Farbton"
      aria-roledescription="Farbrad"
      aria-valuemin="0"
      aria-valuemax="359"
      :aria-valuenow="announcedHue"
      :aria-valuetext="`${hueName(props.hue)}, ${announcedHue} Grad`"
      :aria-disabled="props.disabled || undefined"
      :tabindex="props.disabled ? -1 : 0"
      class="relative mx-auto aspect-square w-full max-w-80 touch-none rounded-full select-none"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @keydown="onKeyDown"
      @contextmenu.prevent
    >
      <div
        data-test="hue-ring"
        aria-hidden="true"
        class="absolute inset-0 rounded-full"
        :style="ringStyle"
      />
      <div aria-hidden="true" class="absolute inset-0" :style="rotatorStyle">
        <span
          data-test="hue-knob"
          class="absolute left-1/2 size-[9%] -translate-x-1/2 rounded-full bg-white shadow ring-2 ring-black/20"
          :style="{ top: `${KNOB_TOP_PERCENT}%` }"
        />
      </div>
      <div
        class="absolute top-1/2 left-1/2 aspect-square w-[40%] -translate-x-1/2 -translate-y-1/2"
        @pointerdown.stop
      >
        <!--
          Stopped here, not skipped in `onPointerDown`: a press on the confirm button bubbles
          through this wrapper on its way up, and without this the wheel would read it as a grab —
          `setPointerCapture` and `dragging = true` — before the dead zone ever gets a say. The
          dead zone only suppresses the immediate jump; it does not stop a drag already in
          progress, so any pointer movement during the button's hold would re-aim the wheel. This
          wrapper is the wheel's own centre slot, so the wheel is the one that gets to say a press
          here is not its business — `HoldButton` stays ignorant of ever sitting inside one.
        -->
        <slot name="center" />
      </div>
    </div>
  </div>
</template>
