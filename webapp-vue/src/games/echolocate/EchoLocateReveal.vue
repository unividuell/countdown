<script setup lang="ts">
/**
 * The card after the round: the field as a map, and the scoreboard under it.
 *
 *   ┌──────────────────────┐
 *   │  clips · noises      │  every pin in its player's colour; a tapped name lights that
 *   │  pins ·  ·  ·        │  player's pings, rings and pins, larger, and draws each
 *   └──────────────────────┘  pin's line to its clip
 *    V Vögel  B Bach  …       the field's legend
 *    Auswertung …
 *
 * Beats come from `revealChoreography`: my own field stands as I left it, then at
 * `SOLUTION_DELAY_MS` the map fades in under it. The scoreboard carries its own beats.
 *
 *   ┌──────────────────────┐        ┌──────────────────────┐
 *   │  my pings, rings, pin│  ───▶  │  the map             │
 *   │                      │        │   + my pings, pin    │
 *   └──────────────────────┘        └──────────────────────┘
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { FADE_MS, SOLUTION_DELAY_MS, isStill } from '@/games/revealChoreography'
import { useRevealArming } from '@/ui/useRevealArming'
import EchoLocateScoreboard from './EchoLocateScoreboard.vue'
import type { Wave } from './flow'
import type { ScoreRow } from './scoreboard'
import SonarField from './SonarField.vue'
import type { Cell, EchoLocatePayload, EchoLocateSolution, Point } from './types'

const props = defineProps<{
  payload: EchoLocatePayload
  solution: EchoLocateSolution
  rows: ScoreRow[]
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** False when this card was already the reveal on arrival: a reload shows the finished map. */
  animate: boolean
  mineUserId: string | null
}>()

/** What one player's play puts on the field. Pings are centres only: no wave is running. */
function fieldOf(row: ScoreRow | undefined): {
  waves: Wave[]
  rings: number[][]
  pins: Point[]
  pinColorHex: string
} {
  return {
    waves: (row?.pings ?? []).map((at) => ({ at, startMs: null, endMs: null })),
    rings: row?.guess?.rings ?? [],
    pins: row?.guess?.pins ?? [],
    // Without a row there is no pin to colour.
    pinColorHex: row?.colorHex ?? '#525252',
  }
}

/** My play, when there is one to show — a give-up has no pings. */
const own = computed(() =>
  props.rows.find((row) => row.userId === props.mineUserId && row.guess !== null),
)

/** The map opens on my own play, as I left the field; a tap on a name moves it. */
const selected = ref<string | null>(own.value?.userId ?? null)

/** A selected row that is gone is skipped — rows keep arriving while the round is live. */
const chosen = computed(() =>
  props.rows.find((row) => row.userId === selected.value && row.guess !== null),
)

const shown = computed(() => fieldOf(chosen.value))

/** A line from each pin to the clip it was matched with: `pinOf[clip]` is that clip's pin. */
const links = computed(() => {
  const pinOf = chosen.value?.pinOf ?? null
  const pins = chosen.value?.guess?.pins ?? null
  if (pinOf === null || pins === null) return []

  return props.solution.targets.flatMap((target, clip): [Point, Cell][] => {
    const at = pinOf[clip]
    const pin = at === undefined ? undefined : pins[at]

    return pin === undefined ? [] : [[pin, target]]
  })
})

/** Everyone else's pins, each in its player's colour; the chosen player's own are drawn larger. */
const otherPins = computed(() =>
  props.rows
    .filter((row) => row.userId !== chosen.value?.userId)
    .flatMap((row) => (row.guess?.pins ?? []).map((at) => ({ at, colorHex: row.colorHex }))),
)

/**
 * Whether my field stands alone until the solution beat. Asked once, on arrival: without a play
 * of mine, or without beats, the reveal shows the finished map at once.
 */
const intro = !isStill(props.animate) && own.value !== undefined

const ownField = computed(() => fieldOf(own.value))

const faded = ref(false)
let solutionTimer: ReturnType<typeof setTimeout> | undefined

// Without an intro there is no beat to arm.
useRevealArming(!intro, () => {
  solutionTimer = setTimeout(() => (faded.value = true), SOLUTION_DELAY_MS)
})

onBeforeUnmount(() => clearTimeout(solutionTimer))

/** The same name again takes its play off the map. */
function select(userId: string): void {
  selected.value = selected.value === userId ? null : userId
}
</script>

<template>
  <div data-test="echo-locate-reveal" class="flex flex-col gap-6">
    <div class="relative">
      <SonarField
        :grid="props.payload.grid"
        :speed="props.payload.speed"
        :reach="props.payload.reach"
        :waves="shown.waves"
        :rings="shown.rings"
        :pins="shown.pins"
        :pin-color-hex="shown.pinColorHex"
        :pending="null"
        :covered="false"
        :solution="props.solution"
        :other-pins="otherPins"
        :links="links"
      />
      <!-- My field alone, over the same field on the map: as this one leaves, the map fades in
           under my pings, which do not move. The box takes no touch, so a finger reaches the map.
           A box of its own, because the field is `relative` itself and would outrank `absolute`. -->
      <div
        v-if="intro"
        data-test="echo-locate-own"
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 transition-opacity"
        :style="{ opacity: faded ? 0 : 1, transitionDuration: `${FADE_MS}ms` }"
      >
        <SonarField
          :grid="props.payload.grid"
          :speed="props.payload.speed"
          :reach="props.payload.reach"
          :waves="ownField.waves"
          :rings="ownField.rings"
          :pins="ownField.pins"
          :pin-color-hex="ownField.pinColorHex"
          :pending="null"
          :covered="false"
        />
      </div>
    </div>

    <EchoLocateScoreboard
      :rows="props.rows"
      :live="props.live"
      :animate="props.animate"
      :selected="selected"
      @select="select"
    />
  </div>
</template>
