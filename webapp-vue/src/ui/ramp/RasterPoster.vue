<script setup lang="ts">
// The name letter by letter through a checkerboard of square cells, row after row, one name
// straight after the other. Fills any height: a taller card just gets more rows. In phase two the
// stake covers one letter of every name, the round picks which, and moves on one cell per beat.
// A tap lets the rows run out, every other one to the right.
//
//   F A R B        tilt -9 → 3 columns
//   A U S 12       tilt  0 → 4
//   A L U N        tilt  9 → 5
//   G F A R …
import { useElementSize, useIntervalFn } from '@vueuse/core'
import { computed, ref, useTemplateRef, watch } from 'vue'
import { prefersReducedMotion } from '@/ui/motion'
import {
  LETTERS,
  posterColors,
  runOut,
  type PosterProps,
  type RampEmits,
  type Strip,
} from './poster'
import PosterPrint from './PosterPrint.vue'
import { posterName, rampLabel, roundLabel } from './posterText'

const props = defineProps<PosterProps>()
const emit = defineEmits<RampEmits>()

/** The poster's variation picks the grid: few big cells or many small ones. */
const COLUMNS: Record<string, number> = { '-9': 3, '0': 4, '9': 5 }
/** The print's height above the grid, in px. */
const PRINT_PX = 40
const HOP_MS = 1400

const root = useTemplateRef<HTMLElement>('root')
const rows = useTemplateRef<HTMLElement[]>('rows')
const top = useTemplateRef<HTMLElement>('top')

const colors = computed(() => posterColors(props.phaseTwo))
const stake = computed(() =>
  props.phaseTwo && props.points !== null && props.points > 0 ? props.points : null,
)

const { width, height } = useElementSize(root)
const columns = computed(() => COLUMNS[String(props.tilt)] ?? 4)
const cell = computed(() => (width.value > 0 ? width.value / columns.value : 90))
const rowCount = computed(() => Math.ceil((height.value - PRINT_PX) / cell.value) + 1)

// The name's letters, spaces dropped: „Farbe raten“ runs as FARBERATENFARBE…
const sequence = computed(() => Array.from(posterName(props.game)).filter((c) => c !== ' '))

/** Positive remainder: `mod(-58, 13)` is 7, not -6. */
function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}

// Where in the name the stake starts: the round's own letter. Then how far it has moved on.
const start = computed(() => mod(props.roundNumber, sequence.value.length))
const step = ref(0)
const hop = useIntervalFn(() => step.value++, HOP_MS, { immediate: false })
watch(
  () => stake.value !== null && props.running && !prefersReducedMotion(),
  (on) => (on ? hop.resume() : hop.pause()),
  { immediate: true },
)

function at(row: number, column: number): { letter: string; stake: boolean } {
  const list = sequence.value
  const index = row * columns.value + column

  return {
    letter: list[index % list.length] ?? '',
    stake: stake.value !== null && mod(index - step.value, list.length) === start.value,
  }
}

/** The stake's digits shrink with their count: `102` still fits its cell. */
const stakeSize = computed(() => {
  const digits = String(stake.value ?? '').length || 1

  return cell.value * Math.min(0.62, 1.2 / digits)
})

const leaving = ref(false)

async function open(): Promise<void> {
  if (leaving.value) return
  leaving.value = true
  emit('open')
  hop.pause()

  const strips: Strip[] = (rows.value ?? []).map((el, index) => ({
    el,
    right: index % 2 === 1,
    rank: Math.min(index, 8),
  }))
  if (top.value) strips.push({ el: top.value, right: false, rank: 0 })

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
      backgroundColor: leaving ? 'transparent' : colors.ground,
      color: colors.ink,
      '--ground': colors.ground,
    }"
    @click="open"
  >
    <!-- Out of the flow: the rows follow the card's height and must not add to it, or every
         extra row buys the next. -->
    <span class="absolute inset-0 flex flex-col items-stretch">
      <span ref="top" class="block shrink-0" :style="{ height: `${PRINT_PX}px` }">
        <PosterPrint left="Aktuelle Runde" :right="`№ ${roundLabel(roundNumber)}`" />
      </span>

      <span
        v-for="r in rowCount"
        :key="r"
        ref="rows"
        class="poster-strip flex shrink-0"
        :style="{ height: `${cell}px` }"
        aria-hidden="true"
      >
        <span
          v-for="c in columns"
          :key="c"
          :data-test="at(r - 1, c - 1).stake ? 'ramp-stake' : 'ramp-cell'"
          class="poster-type flex shrink-0 flex-col items-center justify-center"
          :style="{
            width: `${cell}px`,
            ...((r + c) % 2
              ? { backgroundColor: colors.ink, color: colors.ground }
              : { backgroundColor: colors.ground, color: colors.ink }),
          }"
        >
          <template v-if="!at(r - 1, c - 1).stake">
            <span :style="{ ...LETTERS, fontSize: `${cell * 0.8}px`, lineHeight: 1 }">
              {{ at(r - 1, c - 1).letter }}
            </span>
          </template>
          <template v-else>
            <span :style="{ ...LETTERS, fontSize: `${stakeSize}px`, lineHeight: 1 }">{{
              stake
            }}</span>
            <span class="mt-1 text-[0.6rem] font-medium tracking-[0.2em]">
              {{ stake === 1 ? 'Punkt' : 'Punkte' }}
            </span>
          </template>
        </span>
      </span>
    </span>
  </button>
</template>
