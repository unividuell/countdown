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
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { hueName, wrap360 } from './geometry'
import HueRing from './HueRing.vue'
import HueToleranceSector from './HueToleranceSector.vue'
import { BAND_GROW_MS, layoutGuesses, sectorInk, type RevealGuess } from './reveal'
import { BAND_INNER_FRACTION, easeOutCubic, trackBoxStyle } from './wheel'
import { FADE_MS, RESULTS_DELAY_MS, SOLUTION_DELAY_MS } from '@/games/revealChoreography'
import { inBackground, prefersReducedMotion } from '@/ui/motion'
import { useRevealArming } from '@/ui/useRevealArming'

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

/** Driven by hand — see [growBand]. */
const innerFraction = ref(still ? layout.value.bandInnerFraction : BAND_INNER_FRACTION)

let bandFrame = 0
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
  bandFrame = progress >= 1 ? 0 : requestAnimationFrame(growBand)
}

/**
 * Everything that is only opacity hangs off this one flag; the CSS delays do the beats. Armed the
 * same way every reveal in this app arms — see `useRevealArming` for the two-frame dance and why
 * Firefox needs it. Once armed, hand off straight to the band loop, unless the deepest lane is
 * already at the rim and there is nothing left to grow.
 */
const { shown } = useRevealArming(still, () => {
  bandFrame = layout.value.deepestLane === 0 ? 0 : requestAnimationFrame(growBand)
})

onBeforeUnmount(() => {
  if (bandFrame) cancelAnimationFrame(bandFrame)
})

/**
 * The lab reloads a round at the same seed rather than remounting the card, so a guess can still
 * arrive after this wheel has already settled — `still`, or a `growBand` loop that has already
 * reached `bandFrame = 0`. Not yet `shown` means the arming dance itself is still in flight, and a
 * running `growBand` loop re-reads the live target every frame on its own — neither must be
 * fought over here. Once armed and no loop is driving the band, a late target change would
 * otherwise sit unapplied forever, floating a new marker over a hole that never grew to meet it.
 * No fade for this: the beats belong to the moment of the guess that started them, and this one
 * arrives with no moment to build up to.
 */
watch(
  () => layout.value.bandInnerFraction,
  (target) => {
    if (bandFrame === 0 && shown.value) innerFraction.value = target
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
      class="hue-wheel relative mx-auto aspect-square rounded-full select-none"
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
        :style="{ transitionDuration: `${FADE_MS}ms`, transitionDelay: `${SOLUTION_DELAY_MS}ms` }"
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
