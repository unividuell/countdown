<script setup lang="ts">
// The game's name set to the full width, knocked out of a solid band, and its outlined echoes
// drifting past above and below — level or tilted. A tap lets every line run out the way it was
// drifting.
import { useElementSize } from '@vueuse/core'
import { computed, ref, useTemplateRef } from 'vue'
import {
  LINE,
  posterColors,
  PROBE_PX,
  runOut,
  typesOf,
  useTypeWidth,
  type PosterProps,
  type RampEmits,
  type Strip,
} from './poster'
import PosterPrint from './PosterPrint.vue'
import { posterName, rampLabel, roundLabel, stakeLine } from './posterText'

const props = defineProps<PosterProps>()
const emit = defineEmits<RampEmits>()

/** The echoes' drift, in px/s. */
const DRIFT = 28
/** The ranks the edges are spread over on the way out. */
const RANKS = 5

const root = useTemplateRef<HTMLElement>('root')
const lines = useTemplateRef<HTMLElement[]>('lines')
const top = useTemplateRef<HTMLElement>('top')
const bottom = useTemplateRef<HTMLElement>('bottom')

const colors = computed(() => posterColors(props.phaseTwo))
const name = computed(() => posterName(props.game))
const letters = computed(() => typesOf(props.face).letters)
const stake = computed(() => (props.phaseTwo ? stakeLine(props.points) : null))

const { width, height } = useElementSize(root)
const nameWidth = useTypeWidth(
  () => name.value,
  () => letters.value,
)
const unitWidth = useTypeWidth(
  () => `${name.value} `,
  () => letters.value,
)

const fontSize = computed(() =>
  width.value > 0 && nameWidth.value > 0 ? (PROBE_PX * (width.value - 32)) / nameWidth.value : 48,
)
/** One name plus its gap: what an echo travels before it repeats. */
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
  if (bottom.value) strips.push({ el: bottom.value, right: true, rank: 0 })

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
        '--period': `${period}px`,
        ...letters.css,
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
        <span
          v-else
          class="poster-outline echo inline-block"
          :class="{ 'echo-back': index % 2, 'echo-held': !running }"
          :style="{ animationDuration: drift, animationDelay: `${-index * 1.3}s` }"
          aria-hidden="true"
        >
          <template v-for="n in repeats" :key="n">{{ name }}&nbsp;</template>
        </span>
      </span>
    </span>

    <span ref="top" class="absolute inset-x-0 top-0 block">
      <PosterPrint left="Aktuelle Runde" :right="`№ ${roundLabel(roundNumber)}`" />
    </span>
    <span v-if="stake" ref="bottom" class="absolute inset-x-0 bottom-0 block">
      <PosterPrint :left="stake" />
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

@keyframes echo-drift {
  to {
    transform: translateX(calc(-1 * var(--period)));
  }
}

@media (prefers-reduced-motion: reduce) {
  .echo {
    animation: none;
  }
}
</style>
