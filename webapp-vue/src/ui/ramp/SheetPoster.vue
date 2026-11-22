<script setup lang="ts">
// „Kalenderblatt“: the round's number as the hero, as on the sheet of a tear-off calendar. Behind
// it a second, outlined print, out of register and wandering. A tap lets print, number and name
// run out, each to its side.
import '@fontsource-variable/fraunces/full.css'
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
} from './poster'
import PosterPrint from './PosterPrint.vue'
import { posterName, rampLabel, stakeLine } from './posterText'

const props = defineProps<PosterProps>()
const emit = defineEmits<RampEmits>()

/** The name takes at most this share of the sheet's height. */
const NAME_SHARE = 0.24
/** The number's capitals fill this share of the room left to them. */
const NUMBER_FILL = 0.8
/** The sign's bar and its gap to the digits, as a share of the font size. */
const SIGN = 0.13
/** How far the misprint wanders to the right at most, as a share of the font size. */
const MISPRINT = 0.08
/** A line of small print, in px. */
const PRINT_PX = 40

const root = useTemplateRef<HTMLElement>('root')
const print = useTemplateRef<HTMLElement>('print')
const number = useTemplateRef<HTMLElement>('number')
const title = useTemplateRef<HTMLElement>('title')
const stakeEl = useTemplateRef<HTMLElement>('stakeEl')

const colors = computed(() => posterColors(props.phaseTwo))
const name = computed(() => posterName(props.game))
const stake = computed(() => (props.phaseTwo ? stakeLine(props.points) : null))
// The sign is not set as a glyph: a minus beside the digits costs them a third of the width. It
// lies over them instead, as a bar of their width.
const negative = computed(() => props.roundNumber < 0)
const digits = computed(() => String(Math.abs(props.roundNumber)))

const letters = computed(() => typesOf(props.face).letters)
const digitsType = computed(() => typesOf(props.face).digits)

const { width, height } = useElementSize(root)
const nameWidth = useTypeWidth(
  () => name.value,
  () => letters.value,
)
const digitsWidth = useTypeWidth(
  () => digits.value,
  () => digitsType.value,
)

// To the full width — unless a narrow face would make that taller than the name's share.
const nameSize = computed(() => {
  if (width.value === 0 || nameWidth.value === 0) return 48

  return Math.min(
    (PROBE_PX * (width.value - 32)) / nameWidth.value,
    (height.value * NAME_SHARE) / LINE,
  )
})
// As wide as the sheet, misprint included, or as tall as the room left, whichever comes first:
// „7“ and „117“ both fit.
const numberSize = computed(() => {
  if (width.value === 0 || height.value === 0 || digitsWidth.value === 0) return 200

  const prints = PRINT_PX * (stake.value ? 2 : 1)
  const room = height.value - prints - nameSize.value * LINE - 16

  return Math.min(
    (PROBE_PX * (width.value - 32)) / (digitsWidth.value + MISPRINT * PROBE_PX),
    (room * NUMBER_FILL) / (digitsType.value.cap + (negative.value ? SIGN : 0)),
  )
})

// A level sheet is centred; a tilt sets number and name to its side instead.
const side = computed(() =>
  props.tilt < 0 ? 'justify-start' : props.tilt > 0 ? 'justify-end' : 'justify-center',
)

// Reactive: the ground is bound, a style set by hand would not survive the next render.
const leaving = ref(false)

async function open(): Promise<void> {
  if (leaving.value) return
  leaving.value = true
  emit('open')

  const blocks = [print.value, number.value, title.value, stakeEl.value].filter((el) => el !== null)

  // Gone even if the run-out fails: the round must not stay under the poster.
  try {
    await runOut(
      blocks.map((el, index) => ({
        el,
        right: index % 2 === 1,
        rank: index * 2,
      })),
    )
  } finally {
    emit('gone')
  }
}
</script>

<template>
  <!-- `items-stretch`: WebKit starts a button's flex items at the left, shrunk to their content. -->
  <button
    ref="root"
    type="button"
    data-test="ramp-poster"
    :aria-label="rampLabel({ game, roundNumber, phaseTwo, points })"
    class="relative flex size-full cursor-pointer flex-col items-stretch overflow-hidden focus-visible:-outline-offset-4 focus-visible:outline-2 focus-visible:outline-current"
    :style="{
      // On the way out the strips alone carry the ground.
      backgroundColor: leaving ? 'transparent' : colors.ground,
      color: colors.ink,
      '--ground': colors.ground,
    }"
    @click="open"
  >
    <span ref="print" class="block">
      <PosterPrint left="Aktuelle Runde" />
    </span>

    <span
      ref="number"
      class="poster-strip flex min-h-0 flex-1 items-center overflow-hidden px-4"
      :class="side"
    >
      <span
        class="poster-type relative inline-flex flex-col tabular-nums"
        :style="{ fontSize: `${numberSize}px`, ...digitsType.css }"
      >
        <span
          class="misprint absolute inset-0 flex flex-col"
          :class="{ 'misprint-held': !running }"
          aria-hidden="true"
        >
          <span v-if="negative" class="sign sign-outline" />
          <span class="poster-outline">{{ digits }}</span>
        </span>

        <span v-if="negative" data-test="ramp-sign" class="sign relative bg-current">
          <span class="sr-only">minus</span>
        </span>
        <span class="relative">{{ digits }}</span>
      </span>
    </span>

    <span
      ref="title"
      class="poster-type poster-strip flex px-4 pb-4"
      :class="side"
      :style="{ fontSize: `${nameSize}px`, ...letters.css }"
    >
      {{ name }}
    </span>

    <span v-if="stake" ref="stakeEl" class="block">
      <PosterPrint :left="stake" />
    </span>
  </button>
</template>

<style scoped>
/* As wide as the digits: the column shrinks to them. */
.sign {
  display: block;
  height: 0.1em;
  margin-bottom: 0.03em;
}

/* The misprint's share of the sign, outlined as its digits are. */
.sign-outline {
  border: 1.5px solid currentColor;
}

.misprint {
  opacity: 0.6;
  transform: translate(0.03em, 0.025em);
  animation: misprint-wander 5s ease-in-out infinite alternate;
}

.misprint-held {
  animation-play-state: paused;
}

@keyframes misprint-wander {
  to {
    transform: translate(0.075em, 0.055em);
  }
}

@media (prefers-reduced-motion: reduce) {
  .misprint {
    animation: none;
  }
}
</style>
