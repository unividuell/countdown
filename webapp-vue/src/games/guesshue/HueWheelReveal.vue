<script setup lang="ts">
/**
 * The wheel after the round: a picture, not a control. The same ring, every guess as a marker on
 * its lane, and the tolerance window over it. No pointer handlers, no keyboard, no centre slot.
 *
 * `role="img"` with one label for the whole thing — deliberately less than parity: whoever sees
 * the picture also reads how the guesses stand to each other, and the label says only where the
 * solution is. The full statement is the scoreboard under this wheel, which says every guess,
 * every deviation and every score as text.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { hueName, wrap360 } from './geometry'
import HueRing from './HueRing.vue'
import HueToleranceSector from './HueToleranceSector.vue'
import {
  BAND_GROW_MS,
  FADE_MS,
  RESULTS_DELAY_MS,
  SECTOR_DELAY_MS,
  layoutGuesses,
  sectorInk,
  type RevealGuess,
} from './reveal'
import { BAND_INNER_FRACTION, easeOutCubic, trackBoxStyle } from './wheel'
import { inBackground, prefersReducedMotion } from '@/ui/motion'

const props = defineProps<{
  /** 0 … 1, as the payload carries them. */
  saturation: number
  lightness: number
  targetHue: number
  /** Half-window, in degrees, as the server sends it. Drawn, never checked. */
  toleranceDeg: number
  guesses: RevealGuess[]
  mineUserId: string | null
  /** False when this card was already the reveal on arrival: a reload shows the finished picture. */
  animate: boolean
}>()

const layout = computed(() => layoutGuesses(props.guesses, props.mineUserId))
const ink = computed(() => sectorInk(props.targetHue, props.saturation, props.lightness))

/**
 * Asked once, when the choreography would start, not reactively — the same two questions every
 * animation in this game asks, plus the environment that has no clock at all (happy-dom).
 */
const still =
  !props.animate ||
  prefersReducedMotion() ||
  inBackground() ||
  typeof requestAnimationFrame !== 'function'

/** Everything that is only opacity hangs off this one flag; the CSS delays do the beats. */
const shown = ref(still)
/** Driven by hand — see [growBand]. */
const innerFraction = ref(still ? layout.value.bandInnerFraction : BAND_INNER_FRACTION)

let frame = 0
let bandStarted = -1

/**
 * The band's inner edge is a stop inside a mask gradient, and gradients do not interpolate as
 * `mask-image` — a plain transition on it jumps. The alternative would be a percentage variable
 * registered with `@property`; this loop wins because the input wheel already knows this shape,
 * and because the skipped-motion end state is then written in exactly one place.
 */
function growBand(now: number): void {
  if (bandStarted < 0) bandStarted = now
  const target = layout.value.bandInnerFraction
  const progress = Math.min(1, Math.max(0, (now - bandStarted - RESULTS_DELAY_MS) / BAND_GROW_MS))
  innerFraction.value =
    BAND_INNER_FRACTION + (target - BAND_INNER_FRACTION) * easeOutCubic(progress)
  frame = progress >= 1 ? 0 : requestAnimationFrame(growBand)
}

onMounted(() => {
  if (still) return
  // One frame with the from-state painted first: a transition that is set and started in the
  // same frame does not run at all — that much holds in every engine. Firefox asks for more:
  // it only starts a transition off a style the browser has *already resolved in an earlier
  // frame*, and `onMounted` runs before style has ever been resolved for these elements, so a
  // single rAF here fires in the very frame that would first resolve it — Vue's class patch
  // lands in a microtask ahead of that frame's style recalc, so Firefox finds no "from" value
  // and jumps straight to `opacity-100`. Chrome tolerates this; Firefox does not. Vue's own
  // <Transition> never hits this because it calls forceReflow() before adding its enter-active
  // class, and the band loop never hits it because it writes a value every frame regardless —
  // both of those beats work here for that reason. Mirrored below: force the reflow ourselves in
  // the first frame, then flip `shown` (and hand off to the band loop) only in a second frame, so
  // a painted `opacity-0` frame is guaranteed to exist first. Belt and braces on purpose — this
  // was observed failing in the wild, and one extra frame against a 900 ms delay costs nothing.
  frame = requestAnimationFrame(() => {
    // Read for the side effect, not the value — this is exactly Vue's own forceReflow().
    void document.body.offsetHeight
    frame = requestAnimationFrame(() => {
      shown.value = true
      frame = layout.value.deepestLane === 0 ? 0 : requestAnimationFrame(growBand)
    })
  })
})

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame)
})

/**
 * The lab reloads a round at the same seed rather than remounting the card, so a guess can still
 * arrive after this wheel has already settled — `still`, or a `growBand` loop that has already
 * reached `frame = 0`. `frame === 0` is exactly "no loop is driving the band right now": while one
 * runs, it re-reads the live target every frame on its own and must not be fought over here. Once
 * one isn't, a late target change would otherwise sit unapplied forever, floating a new marker
 * over a hole that never grew to meet it. No fade for this: the beats belong to the moment of the
 * guess that started them, and this one arrives with no moment to build up to.
 */
watch(
  () => layout.value.bandInnerFraction,
  (target) => {
    if (frame === 0) innerFraction.value = target
  },
)

/** Rounded, and folded onto the circle *after* rounding, the same way the input wheel announces. */
function announce(angle: number): number {
  return Math.round(wrap360(angle)) % 360
}

const label = computed(() => {
  const solution = `Die Lösung liegt bei ${hueName(props.targetHue)}, ${announce(props.targetHue)} Grad`
  if (props.toleranceDeg <= 0) return `Farbrad mit allen Tipps. ${solution}.`
  const from = announce(props.targetHue - props.toleranceDeg)
  const to = announce(props.targetHue + props.toleranceDeg)
  return `Farbrad mit allen Tipps. ${solution}; als richtig gilt ${from} bis ${to} Grad.`
})
</script>

<template>
  <div class="w-full">
    <div
      data-test="hue-wheel-reveal"
      role="img"
      :aria-label="label"
      class="relative mx-auto aspect-square w-full max-w-80 rounded-full select-none"
    >
      <HueRing
        :saturation="props.saturation"
        :lightness="props.lightness"
        :inner-fraction="innerFraction"
        :sweep="null"
      />

      <!-- Beat 3: how good was my guess. -->
      <div
        data-test="hue-sector"
        aria-hidden="true"
        class="absolute inset-0 transition-opacity"
        :class="shown ? 'opacity-100' : 'opacity-0'"
        :style="{ transitionDuration: `${FADE_MS}ms`, transitionDelay: `${SECTOR_DELAY_MS}ms` }"
      >
        <HueToleranceSector
          :target-hue="props.targetHue"
          :tolerance-deg="props.toleranceDeg"
          :inner-fraction="innerFraction"
          :color="ink"
        />
      </div>

      <!-- Beat 4: how good was I compared to everyone else. Mine is already there — it is the
           knob, recoloured — so it neither waits nor fades. -->
      <div
        v-for="marker in layout.markers"
        :key="marker.userId"
        data-test="hue-marker-rotator"
        aria-hidden="true"
        class="absolute inset-0"
        :style="{ transform: `rotate(${marker.hue}deg)` }"
      >
        <span
          data-test="hue-marker"
          class="absolute left-1/2 -translate-x-1/2 rounded-full ring-2 ring-white transition-opacity"
          :class="marker.mine || shown ? 'opacity-100' : 'opacity-0'"
          :style="{
            ...trackBoxStyle(marker.trackFraction),
            backgroundColor: marker.colorHex,
            transitionDuration: `${FADE_MS}ms`,
            transitionDelay: `${marker.revealDelayMs}ms`,
          }"
        />
      </div>
    </div>
  </div>
</template>
