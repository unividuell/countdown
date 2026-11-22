<script setup lang="ts">
// The game's name set to the full width, knocked out of a solid band, and its outlined echoes
// drifting past above and below — level or tilted. In phase two the stake sits in a disc at the
// top. A tap lets every line run out the way it was drifting.
import { useElementSize } from '@vueuse/core'
import { computed, ref, useTemplateRef } from 'vue'
import {
  LETTERS,
  LINE,
  posterColors,
  PROBE_PX,
  runOut,
  useTypeWidth,
  type PosterProps,
  type RampEmits,
  type Strip,
} from './poster'
import PosterPrint from './PosterPrint.vue'
import { posterName, rampLabel, roundLabel } from './posterText'

const props = defineProps<PosterProps>()
const emit = defineEmits<RampEmits>()

/** The echoes' drift, in px/s. */
const DRIFT = 28
/** The ranks the edges are spread over on the way out. */
const RANKS = 5
/** The stake's disc: this share of the poster's width, within these bounds in px. */
const DISC_SHARE = 0.3
const DISC_MIN = 96
const DISC_MAX = 140

const root = useTemplateRef<HTMLElement>('root')
const lines = useTemplateRef<HTMLElement[]>('lines')
const top = useTemplateRef<HTMLElement>('top')
const disc = useTemplateRef<HTMLElement>('disc')

const colors = computed(() => posterColors(props.phaseTwo))
const name = computed(() => posterName(props.game))
/** Phase two with something to win: no promise of unwinnable points. */
const stake = computed(() =>
  props.phaseTwo && props.points !== null && props.points > 0 ? props.points : null,
)

const { width, height } = useElementSize(root)
const nameWidth = useTypeWidth(
  () => name.value,
  () => LETTERS,
)
const unitWidth = useTypeWidth(
  () => `${name.value} `,
  () => LETTERS,
)
const stakeWidth = useTypeWidth(
  () => String(stake.value ?? ''),
  () => LETTERS,
)

const fontSize = computed(() =>
  width.value > 0 && nameWidth.value > 0 ? (PROBE_PX * (width.value - 32)) / nameWidth.value : 48,
)
// The drift's speed only: how far an echo travels is the width of one name as laid out (see
// `echo-drift`), never this estimate — scaled from the probe, it is off by fractions of a pixel,
// and an echo whose loop is off jumps once per loop.
const period = computed(() => Math.max(1, (unitWidth.value * fontSize.value) / PROBE_PX))
const drift = computed(() => `${(period.value / DRIFT).toFixed(1)}s`)

// The field of lines, turned: large enough that its corners still cover the box.
const field = computed(() => {
  const angle = (Math.abs(props.tilt) * Math.PI) / 180

  return {
    width: width.value * Math.cos(angle) + height.value * Math.sin(angle),
    height: width.value * Math.sin(angle) + height.value * Math.cos(angle),
  }
})
// Enough lines to cover the field, one to spare at each end, and odd: one is the middle.
const count = computed(() => {
  const n = Math.ceil(field.value.height / (fontSize.value * LINE)) + 2

  return n % 2 ? n : n + 1
})
const centre = computed(() => (count.value - 1) / 2)
/** An echo is the name over and over: wider than the field plus one period. */
const repeats = computed(() => Math.ceil(field.value.width / period.value) + 2)

const discSize = computed(() => Math.min(DISC_MAX, Math.max(DISC_MIN, width.value * DISC_SHARE)))
// As large as the disc allows: at most 70 % of its width, its capitals at most 42 % of its height.
const stakeSize = computed(() => {
  const byHeight = (discSize.value * 0.42) / 0.72
  if (stakeWidth.value === 0) return byHeight

  return Math.min(byHeight, (PROBE_PX * discSize.value * 0.7) / stakeWidth.value)
})

// Reactive: the ground is bound, a style set by hand would not survive the next render.
const leaving = ref(false)

async function open(): Promise<void> {
  if (leaving.value) return
  leaving.value = true
  emit('open')

  const strips: Strip[] = (lines.value ?? []).map((el, index) => {
    const fromCentre = Math.abs(index - centre.value)

    return {
      el,
      // `echo-back` drifts to the right: the odd lines.
      right: index % 2 === 1,
      // The name holds a beat longer than its neighbours.
      rank: fromCentre === 0 ? RANKS + 3 : RANKS - Math.min(fromCentre, RANKS),
    }
  })
  if (top.value) strips.push({ el: top.value, right: false, rank: 0 })
  // Its own width and the gap to the edge: the disc is no wider than itself.
  if (disc.value) strips.push({ el: disc.value, right: true, rank: 0, travel: 'calc(100% + 1rem)' })

  // Gone even if the run-out fails: the round must not stay under the poster.
  try {
    await runOut(strips)
  } finally {
    emit('gone')
  }
}
</script>

<template>
  <button
    ref="root"
    type="button"
    data-test="ramp-poster"
    :aria-label="rampLabel({ game, roundNumber, phaseTwo, points })"
    class="relative block size-full cursor-pointer overflow-hidden focus-visible:-outline-offset-4 focus-visible:outline-2 focus-visible:outline-current"
    :style="{
      // On the way out the strips alone carry the ground.
      backgroundColor: leaving ? 'transparent' : colors.ground,
      color: colors.ink,
      '--ground': colors.ground,
    }"
    @click="open"
  >
    <span
      class="absolute top-1/2 left-1/2 flex -translate-1/2 flex-col justify-center"
      :style="{
        width: `${field.width}px`,
        height: `${field.height}px`,
        rotate: `${tilt}deg`,
        fontSize: `${fontSize}px`,
        ...LETTERS,
      }"
    >
      <!-- Clipped sideways only: an umlaut's dots reach into the line above. -->
      <span
        v-for="(_, index) in count"
        :key="index"
        ref="lines"
        class="poster-type poster-strip block shrink-0 overflow-x-clip"
      >
        <!-- Room above for an umlaut's dots: outside the band they would vanish in the ground. -->
        <span
          v-if="index === centre"
          class="block pt-[0.16em] pb-[0.08em] text-center"
          :style="{ backgroundColor: colors.ink, color: colors.ground }"
        >
          {{ name }}
        </span>
        <!-- One box per name: the row is exactly `repeats` names wide, so one name is a share of
             it (`echo-drift`). -->
        <span
          v-else
          data-test="ramp-echo"
          class="poster-outline echo inline-flex"
          :class="{ 'echo-back': index % 2, 'echo-held': !running }"
          :style="{
            animationDuration: drift,
            animationDelay: `${-index * 1.3}s`,
            '--repeats': repeats,
          }"
          aria-hidden="true"
        >
          <span v-for="n in repeats" :key="n">{{ name }}&nbsp;</span>
        </span>
      </span>
    </span>

    <span ref="top" class="absolute inset-x-0 top-0 block">
      <PosterPrint left="Aktuelle Runde" :right="`№ ${roundLabel(roundNumber)}`" />
    </span>

    <!-- The stake on top of the lines, dressed like the name's band. -->
    <span
      v-if="stake !== null"
      ref="disc"
      data-test="ramp-stake"
      class="absolute top-12 right-4 flex flex-col items-center justify-center rounded-full"
      :style="{
        width: `${discSize}px`,
        height: `${discSize}px`,
        backgroundColor: colors.ink,
        color: colors.ground,
      }"
      aria-hidden="true"
    >
      <span class="poster-type tabular-nums" :style="{ fontSize: `${stakeSize}px`, ...LETTERS }">
        {{ stake }}
      </span>
      <span class="mt-1 text-[0.6rem] font-medium tracking-[0.2em] uppercase">
        {{ stake === 1 ? 'Punkt' : 'Punkte' }}
      </span>
    </span>
  </button>
</template>

<style scoped>
.echo {
  opacity: 0.55;
  animation: echo-drift linear infinite;
}

.echo-back {
  animation-direction: reverse;
}

.echo-held {
  animation-play-state: paused;
}

/* One name to the left: a share of the row's own laid-out width, so the loop closes exactly. */
@keyframes echo-drift {
  to {
    transform: translateX(calc(-100% / var(--repeats)));
  }
}

@media (prefers-reduced-motion: reduce) {
  .echo {
    animation: none;
  }
}
</style>
