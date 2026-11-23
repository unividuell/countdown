<script setup lang="ts">
/**
 * The card after the round: the submitted board stays, and the water runs along what the selected
 * tip wets — then dirty puddles lie where it burst, or on every pipe it missed. A name in the table
 * turns the grid to that tip
 * and replays its water; the same name again lets go, and the solution fills every pipe.
 *
 *   selection ─▶ shownBoard ─▶ turn (TURN_MS) ─▶ water, one cell per step ─▶ end sound + puddles
 *                                    my first run only: end sound silent ─▶ VERDICT_GAP_MS ─▶ verdict
 *                                                                                   + the table's rows
 *
 * The very first picture waits for the beat; a reload (`isStill`) lands on the end at once.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { provideRevealTimeline } from '@/games/revealTimeline'
import { useSoundStage } from '@/ui/useSoundAwake'
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
  /** Whether my tip earns the success sound (`myWin`); `null` plays nothing. */
  won: boolean | null
}>()

/** Its knocks are governed by the header's sound switch, which wakes the graph while it is here. */
useSoundStage()

/** How far a flow fades out when the water ends. */
const FLOW_FADE_S = 0.3
/**
 * The shared verdict follows the game's own end sound, not the solution's beat: the water runs,
 * the end sound rings out, then a breath, then the verdict — one after the other, never on top.
 */
const VERDICT_GAP_MS = 200

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
/** Set by the reveal's own first run; a tip replayed by its name plays no verdict. */
let verdictDue = false
let verdictBeat: ReturnType<typeof setTimeout> | undefined

const timeline = provideRevealTimeline({ animate: props.animate, won: () => props.won })
const still = timeline.still

/** The water is the story: the verdict waits for its end sound. */
const story = timeline.hold()

function halt(): void {
  clearTimeout(beat)
  clearTimeout(verdictBeat)
  water.stop()
  flow?.stop(FLOW_FADE_S)
  flow = undefined
}

/** Turn to [board], then let the water run, with its sound. */
function present(board: ShownBoard | null): void {
  halt()
  water.fill([])
  puddles.value = NO_PUDDLES
  if (!board) {
    if (verdictDue) verdictAfter(0)
    return
  }

  turns.value = turnedTo(board)
  beat = setTimeout(() => {
    flow = startFlow()

    water.run(
      board.wet,
      () => {
        flow?.stop(FLOW_FADE_S)
        flow = undefined
        const end = playSound(board.endSound)
        puddles.value = new Set(board.puddles)
        if (verdictDue) verdictAfter(end.endsInS)
      },
      waterStepMs(props.payload.size),
    )
  }, TURN_MS)
}

/** The verdict and the rows once the end sound, ringing for [endsInS] more, has fallen silent. */
function verdictAfter(endsInS: number): void {
  verdictDue = false
  verdictBeat = setTimeout(story.release, endsInS * 1000 + VERDICT_GAP_MS)
}

// The board may never have mounted (reload, history, onlooker): decode here, once per page.
onMounted(preloadSounds)

if (still && shown.value) showEnd(shown.value)

if (!still) {
  timeline.on('story', () => {
    verdictDue = true
    present(shown.value)
  })
}

// A name tapped before the verdict: the rows come, the verdict stays unsaid.
watch(selectedUserId, () => {
  verdictDue = false
  story.releaseSilently()
  present(shown.value)
})

onBeforeUnmount(halt)
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

    <TurnPipesScoreboard
      :rows="props.rows"
      :live="props.live"
      :selected-user-id="selectedUserId"
      @select="select"
    />
  </div>
</template>
