<script setup lang="ts">
/**
 * The card after the round: the submitted board stays, and the water runs along what the selected
 * tip wets — then dirty puddles lie where it burst, or on every pipe it missed. A name in the table
 * turns the grid to that tip
 * and replays its water; the same name again lets go, and the solution fills every pipe.
 *
 *   selection ─▶ shownBoard ─▶ turn (TURN_MS) ─▶ water, one cell per step ─▶ end sound + puddles
 *
 * The very first picture waits for the beat; a reload (`isStill`) lands on the end at once.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { SOLUTION_DELAY_MS, isStill } from '@/games/revealChoreography'
import SoundToggle from '@/ui/SoundToggle.vue'
import { useGameSound } from '@/ui/useGameSound'
import { useRevealArming } from '@/ui/useRevealArming'
import PipeGrid from './PipeGrid.vue'
import { shownBoard } from './reveal'
import type { ShownBoard } from './reveal'
import type { ScoreRow } from './scoreboard'
import { playSound, preloadSounds, startFlow } from './sounds'
import type { Playing } from './sounds'
import TurnPipesScoreboard from './TurnPipesScoreboard.vue'
import { TURN_MS, turnTo } from './turns'
import type { TurnPipesOutcome, TurnPipesPayload, TurnPipesSolution } from './types'
import { useWaterRun, waterStepMs } from './water'

const props = defineProps<{
  payload: TurnPipesPayload
  /** `null` while the round does not hand it out. */
  solution: TurnPipesSolution | null
  rows: ScoreRow[]
  mineUserId: string | null
  /** `null` without a tip of my own: history, onlookers. */
  myRotations: number[] | null
  myOutcome: TurnPipesOutcome | null
  live: boolean
  animate: boolean
}>()

/** How far a flow fades out when the water ends. */
const FLOW_FADE_S = 0.3

const sound = useGameSound()
const water = useWaterRun()

/** Own tip preselected, as long as there is one to show. */
const selectedUserId = ref<string | null>(
  props.myOutcome && props.myRotations ? props.mineUserId : null,
)

/** A name shows that tip; the same one again lets go, and the solution stands. */
function select(userId: string): void {
  selectedUserId.value = selectedUserId.value === userId ? null : userId
}

const shown = computed(() =>
  shownBoard({
    size: props.payload.size,
    selectedUserId: selectedUserId.value,
    mineUserId: props.mineUserId,
    myRotations: props.myRotations,
    myOutcome: props.myOutcome,
    rows: props.rows,
    solution: props.solution,
  }),
)

/** Unbounded quarter turns, so a pipe keeps turning the same way. */
const turns = ref<number[]>([...(props.myRotations ?? props.payload.start)])
const NO_PUDDLES: ReadonlySet<number> = new Set()
const puddles = ref<ReadonlySet<number>>(NO_PUDDLES)

function turnedTo(board: ShownBoard): number[] {
  return turns.value.map((t, cell) =>
    turnTo(t, board.rotations[cell] ?? 0, props.payload.kinds[cell]!),
  )
}

/** The picture at its end, nothing played. */
function showEnd(board: ShownBoard): void {
  turns.value = turnedTo(board)
  water.fill(board.wet)
  puddles.value = new Set(board.puddles)
}

let beat: ReturnType<typeof setTimeout> | undefined
let flow: Playing | undefined

function halt(): void {
  clearTimeout(beat)
  water.stop()
  flow?.stop(FLOW_FADE_S)
  flow = undefined
}

/** Turn to [board], then let the water run, with sound while sound is on. */
function present(board: ShownBoard | null): void {
  halt()
  water.fill([])
  puddles.value = NO_PUDDLES
  if (!board) return

  turns.value = turnedTo(board)
  beat = setTimeout(() => {
    if (sound.value) flow = startFlow()

    water.run(
      board.wet,
      () => {
        flow?.stop(FLOW_FADE_S)
        flow = undefined
        if (sound.value) playSound(board.endSound)
        puddles.value = new Set(board.puddles)
      },
      waterStepMs(props.payload.size),
    )
  }, TURN_MS)
}

// The board may never have mounted (reload, history, onlooker): decode here, once per page.
onMounted(preloadSounds)

// Muting silences the water that is already running, not only the next run.
watch(sound, (on) => {
  if (on) return
  flow?.stop(0)
  flow = undefined
})

const still = isStill(props.animate)

if (still && shown.value) showEnd(shown.value)

useRevealArming(still, () => {
  beat = setTimeout(() => present(shown.value), SOLUTION_DELAY_MS)
})

watch(selectedUserId, () => present(shown.value))

onBeforeUnmount(() => {
  halt()
})
</script>

<template>
  <div data-test="turn-pipes-reveal" class="flex flex-col gap-6">
    <!-- Card-wide like the board's, so the grid stays put at submit. No `w-full`: it would
         cancel the bleed. -->
    <div class="-mx-4 -mt-2">
      <PipeGrid
        :size="props.payload.size"
        :kinds="props.payload.kinds"
        :turns="turns"
        :wet="water.wet.value"
        :puddles="puddles"
        :cold="shown?.endSound === 'dry'"
        :interactive="false"
      />
    </div>

    <div class="-mb-3 flex justify-end">
      <SoundToggle
        class="flex size-11 cursor-pointer items-center justify-center rounded-full bg-surface-container text-on-surface"
      />
    </div>

    <TurnPipesScoreboard
      :rows="props.rows"
      :live="props.live"
      :animate="props.animate"
      :selected-user-id="selectedUserId"
      @select="select"
    />
  </div>
</template>
