<script setup lang="ts">
/**
 * The card after the round: the build field turns into the solution — the same view, the same
 * framing, so nothing moves at the switch — and the scoreboard takes the template's place.
 *
 * The template is drawn through my own inverse fit, so it stands in the coordinates of my build.
 * Beats come from `revealChoreography`: my build as it stood, then the solution marks with one
 * full turn of the field, so every error comes to the front once; the scoreboard carries its own
 * beat.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { SOLUTION_DELAY_MS } from '@/games/revealChoreography'
import { inBackground, prefersReducedMotion } from '@/ui/motion'
import { useRevealArming } from '@/ui/useRevealArming'
import BlockScene from './BlockScene.vue'
import CentreButton from './CentreButton.vue'
import CopyBlocksScoreboard from './CopyBlocksScoreboard.vue'
import { fieldOf } from './field'
import { revealView } from './reveal'
import type { Mark } from './reveal'
import type { ScoreRow } from './scoreboard'
import type { CopyBlocksOutcome, CopyBlocksPayload, GuessBlock } from './types'
import { SPIN_MS, spunYaw } from './view'
import type { Camera } from './view'

const props = defineProps<{
  payload: CopyBlocksPayload
  rows: ScoreRow[]
  mineUserId: string | null
  /** `null` without a tip of my own: history, onlookers. */
  myGuess: GuessBlock[] | null
  myOutcome: CopyBlocksOutcome | null
  live: boolean
  animate: boolean
}>()

/** The board's camera, so the reveal opens at the angle of the submission. */
const camera = defineModel<Camera>('camera', { required: true })

/** The build field's ground, as on the board. */
const BUILD_GROUND = '#cfe2f4'
const NO_MARKS: Mark[] = []

/** A reload, reduced motion, a background tab: just be there. */
const still =
  !props.animate ||
  prefersReducedMotion() ||
  inBackground() ||
  typeof requestAnimationFrame !== 'function'

const solved = ref(still)
let solutionTimer: ReturnType<typeof setTimeout> | undefined

useRevealArming(still, () => {
  solutionTimer = setTimeout(() => {
    solved.value = true
    spin()
  }, SOLUTION_DELAY_MS)
})

let spinFrame = 0

/** One full turn about the vertical, timed by the frames' own clock from the first one on. */
function spin(): void {
  const from = camera.value.yaw
  let startedAt: number | null = null

  const step = (now: number) => {
    startedAt ??= now
    const elapsed = now - startedAt
    camera.value = { ...camera.value, yaw: spunYaw(from, elapsed) }
    spinFrame = elapsed < SPIN_MS ? requestAnimationFrame(step) : 0
  }
  spinFrame = requestAnimationFrame(step)
}

/** A finger or the wheel on the view takes over; the view stays where the turn left it. */
function stopSpin(): void {
  if (spinFrame) cancelAnimationFrame(spinFrame)
  spinFrame = 0
}

onBeforeUnmount(() => {
  clearTimeout(solutionTimer)
  stopSpin()
})

/** Mine, when there is a tip of mine to show. */
const own = computed(() => (props.myOutcome ? props.mineUserId : null))
const selectedUserId = ref<string | null>(own.value)

/** A name shows that tip; the same one again lets go, and the bare solution stands. */
function select(userId: string): void {
  selectedUserId.value = selectedUserId.value === userId ? null : userId
}

const shown = computed(() => {
  const id = selectedUserId.value
  if (id === null) return null

  return id === props.mineUserId
    ? props.myOutcome
    : (props.rows.find((r) => r.userId === id)?.outcome ?? null)
})

const view = computed(() =>
  revealView({
    template: props.payload.blocks,
    ownFit: props.myOutcome?.fit ?? null,
    shown: shown.value,
  }),
)

/** The camera frames the submitted build, whichever tip is shown: nothing ever moves the view. */
const frame = computed(() => fieldOf(props.myGuess ?? props.payload.blocks, props.payload.grid))

/**
 * The floor under my build and the solution together. A tip that matched only the template's top
 * stands higher than the solution, so its own floor would cut through it.
 */
const solutionField = computed(() => {
  const solution = revealView({
    template: props.payload.blocks,
    ownFit: props.myOutcome?.fit ?? null,
    shown: null,
  }).blocks
  return fieldOf([...(props.myGuess ?? []), ...solution], props.payload.grid)
})

/** My build's floor until the solution beat, then the solution's — it arrives with the solution. */
const field = computed(() => (solved.value ? solutionField.value : frame.value))

/** The box beneath the view: on, the errors are marked; off, the tip stands bare. */
const markErrors = ref(true)

/** Until the solution beat the view shows only the build as it stood. */
const marks = computed(() => (solved.value && markErrors.value ? view.value.marks : NO_MARKS))
</script>

<template>
  <div data-test="copy-blocks-reveal" class="flex flex-col gap-6">
    <!-- Card-wide and as tall as the board's build field, which it replaces. -->
    <section
      data-test="copy-blocks-reveal-view"
      class="relative -mx-4 -mt-4 h-[46svh] overflow-hidden"
      :style="{ background: BUILD_GROUND }"
      @pointerdown.capture="stopSpin"
      @wheel.capture.passive="stopSpin"
    >
      <BlockScene
        v-model:camera="camera"
        :blocks="view.blocks"
        :field="field"
        :frame="frame"
        build
        :marks="marks"
        :background="BUILD_GROUND"
      />
      <div class="absolute top-1 left-1">
        <CentreButton v-model:camera="camera" />
      </div>
    </section>

    <label
      data-test="copy-blocks-mark-errors"
      class="-mt-4 flex min-h-11 cursor-pointer items-center gap-2 self-end text-sm"
    >
      <input v-model="markErrors" type="checkbox" class="size-4 cursor-pointer" />
      Fehler markieren
    </label>

    <CopyBlocksScoreboard
      :rows="props.rows"
      :live="props.live"
      :animate="props.animate"
      :selected-user-id="selectedUserId"
      @select="select"
    />
  </div>
</template>
