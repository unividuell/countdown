<script setup lang="ts">
/**
 * The card after the round: the board's field, now read-only. B grows from my tip to the true
 * factor, my tip stays as a dashed outline at B's corner, and the scoreboard sits under it. Each
 * name in the table toggles that player's outline over the same corner, any number at once — mine
 * too, which starts on show.
 *
 *   0 ─────────────────────── SOLUTION_DELAY_MS ──────────▶
 *   board view ──▶ fitted view
 *   B as sent, amber, filled ──▶ my dashed outline at the corner
 *                                       true B fades in, grows tip ──▶ factor
 *                                       tick by tick with a count up (or down), then my verdict
 *                                       rows land once B has arrived (≥ RESULTS_DELAY_MS)
 *
 * Everything eases via CSS; frames only arm it. Live after my own submit in this tab only: a
 * reload, history or reduced motion shows the end state at once.
 *
 * Nothing saved says where B stood when the tip went in, so every tip ends at B's starting corner:
 * sizes compare there, positions do not exist.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RESULTS_DELAY_MS, SOLUTION_DELAY_MS, isStill } from '@/games/revealChoreography'
import { inBackground } from '@/ui/motion'
import { playVerdict, type Verdict } from '@/ui/verdictSound'
import { useRevealArming } from '@/ui/useRevealArming'
import { playCount, type Counting } from './countSound'
import { countTones, growEasing, growMs } from './countTones'
import {
  FIELD_PX,
  fitView,
  initialPlacements,
  sizeAt,
  type Box,
  type Placement,
  type Submitted,
} from './gestures'
import MatchScaleFootnotes from './MatchScaleFootnotes.vue'
import MatchScaleLegend from './MatchScaleLegend.vue'
import MatchScaleScoreboard from './MatchScaleScoreboard.vue'
import ScaleField, { type Camera, type GrowTiming, type Outline } from './ScaleField.vue'
import { truthOf, type ScoreboardRow } from './scoreboard'
import type { MatchScalePayload, Measure } from './types'

const props = defineProps<{
  payload: MatchScalePayload
  factor: number
  /** The real sizes behind the factor, named under the field; `null` where the dataset has none. */
  measureA: Measure | null
  measureB: Measure | null
  /** `null` without a tip of my own: history, onlookers. */
  myScale: number | null
  myColorHex: string
  mineUserId: string | null
  rows: ScoreboardRow[]
  /** Which verdict closes the count: `null` plays none. */
  won: boolean | null
  live: boolean
  animate: boolean
  /** The board as my tip left it, if it did so in this tab. */
  from: Submitted | null
}>()

const A_COLOR = 'var(--color-on-surface-variant)'
const B_COLOR = 'var(--color-match-scale-b)'

const start = computed(() => initialPlacements(props.payload.a))

const truth = computed(() => truthOf(props.measureA, props.measureB))

const still = isStill(props.animate)

/** Where B is drawn: at my tip until the beat, then at the truth. Without a tip there is no start. */
const bScale = ref(still || props.myScale === null ? props.factor : props.myScale)

/** The count B's growth rides: each tone sounds as B passes it. */
const tones = countTones(bScale.value, props.factor)

/** Without `linear()` B still eases, only not in step with the ticks. */
const growTiming: GrowTiming = {
  ms: growMs(tones),
  easing: supportsLinear() ? growEasing(tones) : 'ease-out',
}

function supportsLinear(): boolean {
  return typeof CSS !== 'undefined' && CSS.supports('transition-timing-function', 'linear(0, 1)')
}

/** A long count would run under the rows; they wait for B. */
const resultsDelayMs = Math.max(RESULTS_DELAY_MS, SOLUTION_DELAY_MS + growTiming.ms)

/** B eases only during its growth; afterwards a view refit moves B with everything else. */
const growing = ref(!still)

/** The tip travels only from the board it was sent from, and only as that tip. */
const handoff =
  still || props.from === null || props.from.b.scale !== props.myScale ? null : props.from

/** Two frames after mount, so the board's state is painted before it eases away. */
const { shown: moved } = useRevealArming(handoff === null)

/** The beat: the tip has arrived, B is there, camera and tip ease no more. */
const arrived = ref(handoff === null)

let beat: ReturnType<typeof setTimeout> | undefined
let settle: ReturnType<typeof setTimeout> | undefined

let counting: Counting | null = null
let verdict: Verdict | null = null

onMounted(() => {
  if (bScale.value === props.factor && handoff === null) {
    // Nothing to grow: B must not ease on later refits either.
    growing.value = false
    // No count to close (reduced motion): the verdict at once, as `useRevealVerdict` plays it.
    if (props.animate && !inBackground() && props.won !== null) verdict = playVerdict(props.won)

    return
  }

  beat = setTimeout(() => {
    counting = playCount(tones, props.won)
    bScale.value = props.factor
    arrived.value = true
    settle = setTimeout(() => {
      growing.value = false
    }, growTiming.ms)
  }, SOLUTION_DELAY_MS)
})

onBeforeUnmount(() => {
  clearTimeout(beat)
  clearTimeout(settle)
  counting?.stop()
  verdict?.stop()
})

const placementB = computed<Placement>(() => ({ ...start.value.b, scale: bScale.value }))

/** Each row toggles on its own; mine starts on show. */
const shown = ref<ReadonlySet<string>>(
  new Set(props.mineUserId !== null && props.myScale !== null ? [props.mineUserId] : []),
)

function select(userId: string): void {
  const next = new Set(shown.value)
  if (!next.delete(userId)) next.add(userId)
  shown.value = next
}

const selected = computed(() => [...shown.value])

function outlineAt(scale: number, color: string): Outline {
  return { placement: { ...start.value.b, scale }, color, dashed: true }
}

/** Mine starts as B left the board — there, filled, amber — and eases into its outline. */
function myOutline(scale: number): Outline {
  if (handoff !== null && !moved.value) {
    return { placement: handoff.b, color: B_COLOR, dashed: true, filled: true, eased: true }
  }

  const outline = outlineAt(scale, props.myColorHex)

  return arrived.value ? outline : { ...outline, eased: true }
}

const camera = computed<Camera | null>(() =>
  handoff === null || arrived.value ? null : { from: handoff.view, moved: moved.value },
)

const showMine = computed(
  () => props.myScale !== null && props.mineUserId !== null && shown.value.has(props.mineUserId),
)

/** Other players on show, in table order. */
const others = computed(() =>
  props.rows.filter((row) => row.userId !== props.mineUserId && shown.value.has(row.userId)),
)

const outlines = computed<Outline[]>(() => {
  const result: Outline[] = []
  if (props.myScale !== null && showMine.value) {
    result.push(myOutline(props.myScale))
  }
  for (const row of others.value) result.push(outlineAt(row.scale, row.colorHex))

  return result
})

/** The view holds A, the true B and every outline on show, so a tapped tip is never off-field. */
const view = computed(() => {
  const boxes: Box[] = [
    boxOf(props.payload.a, start.value.a),
    boxOf(props.payload.b, { ...start.value.b, scale: props.factor }),
  ]
  if (props.myScale !== null && showMine.value) {
    boxes.push(boxOf(props.payload.b, { ...start.value.b, scale: props.myScale }))
  }
  for (const row of others.value) {
    boxes.push(boxOf(props.payload.b, { ...start.value.b, scale: row.scale }))
  }

  return fitView(boxes, FIELD_PX)
})

function boxOf(s: MatchScalePayload['a'], p: Placement): Box {
  const { w, h } = sizeAt(s, p.scale)

  return { x: p.x, y: p.y, w, h }
}
</script>

<template>
  <div data-test="match-scale-reveal" class="flex flex-col gap-6">
    <div class="flex flex-col gap-3">
      <ScaleField
        :a="props.payload.a"
        :b="props.payload.b"
        :a-color="A_COLOR"
        :b-color="B_COLOR"
        :view="view"
        :placement-a="start.a"
        :placement-b="placementB"
        :outlines="outlines"
        :interactive="false"
        :grow="growing"
        :grow-timing="growTiming"
        :b-hidden="!arrived"
        :camera="camera"
      />

      <MatchScaleLegend
        :a="props.payload.a"
        :b="props.payload.b"
        :a-color="A_COLOR"
        :b-color="B_COLOR"
        :measure-a="props.measureA"
        :measure-b="props.measureB"
        :factor="props.factor"
        :legend="props.payload.categoryLegend"
      />
    </div>

    <MatchScaleScoreboard
      :rows="props.rows"
      :live="props.live"
      :animate="props.animate"
      :selected="selected"
      :factor="props.factor"
      :tolerance="props.payload.tolerance"
      :truth="truth"
      :results-delay-ms="resultsDelayMs"
      @select="select"
    />

    <MatchScaleFootnotes
      :a="props.payload.a"
      :b="props.payload.b"
      :measure-a="props.measureA"
      :measure-b="props.measureB"
      :legend="props.payload.categoryLegend"
    />
  </div>
</template>
