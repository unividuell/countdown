<script setup lang="ts">
/**
 * Where the player is facing, as a band of the horizon rather than a dial.
 *
 * Street View has no compass to borrow: the API's only direction-aware control is `panControl`, a
 * round widget for turning, and it says nothing about north. The heading is available though, so
 * the band is ours — and a band beats a dial here because the thing being read is one word („O“),
 * not an angle.
 *
 * The centre of the band is the centre of the view, which is where the crosshair is: what the
 * crosshair sits on, the band names.
 */
import { computed } from 'vue'

const props = defineProps<{ heading: number }>()

/** German points, every 45° — finer than that and a name stops being a name. */
const POINTS = [
  { deg: 0, label: 'N' },
  { deg: 45, label: 'NO' },
  { deg: 90, label: 'O' },
  { deg: 135, label: 'SO' },
  { deg: 180, label: 'S' },
  { deg: 225, label: 'SW' },
  { deg: 270, label: 'W' },
  { deg: 315, label: 'NW' },
]

/**
 * Degrees of horizon across the band's width. 120 puts three points on screen at once, which is
 * enough to see which way the next one is coming — a wider span turns the labels into a blur when
 * panning, a narrower one leaves the band empty between points.
 *
 * Deliberately not the panorama's own field of view: that changes with every zoom step, and a band
 * whose scale breathes is harder to read than one that is merely approximate off-centre. The
 * centre is exact either way, and the centre is what is being asked about.
 */
const SPAN = 120

const marks = computed(() =>
  POINTS.map((point) => {
    // Wrapped into (-180, 180]: the horizon is a loop, so a point 350° to the right of the view is
    // 10° to its left. Without this, turning past north sends every label the long way round.
    const delta = ((point.deg - props.heading + 540) % 360) - 180
    return { label: point.label, offset: (delta / SPAN) * 100 }
  }).filter((mark) => Math.abs(mark.offset) <= 60),
)
</script>

<template>
  <!-- `aria-hidden`: the heading is orientation, never a control, and nothing about submitting a
       tip depends on having read it. -->
  <div
    data-test="spot-compass"
    aria-hidden="true"
    class="relative h-6 overflow-hidden bg-black/25 text-[10px] font-medium tracking-wide text-white backdrop-blur-sm select-none"
  >
    <span
      v-for="mark in marks"
      :key="mark.label"
      data-test="spot-compass-point"
      :data-point="mark.label"
      :style="{ left: `calc(50% + ${mark.offset}%)` }"
      class="absolute top-0 flex h-full -translate-x-1/2 items-center"
      >{{ mark.label }}</span
    >

    <!-- The centre, marked so the band can be read at a glance rather than estimated. Directly
         above the crosshair, and about the same direction. -->
    <span class="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-white/70" />
  </div>
</template>
