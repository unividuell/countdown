<script setup lang="ts">
/**
 * The card after the round: the board's field, now read-only. B grows from my tip to the true
 * factor, my tip stays as a dashed outline at B's corner, and the scoreboard sits under it. A name
 * in the table lays that player's outline over the same corner; the same name again lifts it —
 * mine too, which starts on show.
 *
 *   0 ─────────────────────── SOLUTION_DELAY_MS ──────────▶
 *   board view ──▶ fitted view
 *   B as sent, amber, filled ──▶ my dashed outline at the corner
 *                                       true B fades in, grows tip ──▶ factor
 *                                       a count up (or down) in tones, as fast as B grows
 *
 * Everything eases via CSS; frames only arm it. Live after my own submit in this tab only: a
 * reload, history or reduced motion shows the end state at once.
 *
 * Nothing saved says where B stood when the tip went in, so every tip ends at B's starting corner:
 * sizes compare there, positions do not exist.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { SOLUTION_DELAY_MS, isStill } from '@/games/revealChoreography'
import SoundToggle from '@/ui/SoundToggle.vue'
import { useGameSound } from '@/ui/useGameSound'
import { useRevealArming } from '@/ui/useRevealArming'
import { playCount, unlockSound, type Counting } from './countSound'
import { countTones } from './countTones'
import {
  FIELD_PX,
  fitView,
  initialPlacements,
  sizeAt,
  type Box,
  type Placement,
  type Submitted,
} from './gestures'
import MatchScaleScoreboard from './MatchScaleScoreboard.vue'
import ScaleField, { type Camera, type Outline } from './ScaleField.vue'
import type { ScoreboardRow } from './scoreboard'
import type { MatchScalePayload } from './types'

const props = defineProps<{
  payload: MatchScalePayload
  factor: number
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

const still = isStill(props.animate)

/** Where B is drawn: at my tip until the beat, then at the truth. Without a tip there is no start. */
const bScale = ref(still || props.myScale === null ? props.factor : props.myScale)

/** Matches `duration-700` on B in ScaleField. */
const GROW_MS = 700

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

const sound = useGameSound()
let counting: Counting | null = null

onMounted(() => {
  if (bScale.value === props.factor && handoff === null) {
    // Nothing to grow: B must not ease on later refits either.
    growing.value = false

    return
  }

  beat = setTimeout(() => {
    if (sound.value) counting = playCount(countTones(bScale.value, props.factor), props.won)
    bScale.value = props.factor
    arrived.value = true
    settle = setTimeout(() => {
      growing.value = false
    }, GROW_MS)
  }, SOLUTION_DELAY_MS)
})

// Muting silences the count that is already running, not only the next one.
watch(sound, (on) => {
  if (!on) counting?.stop()
})

onBeforeUnmount(() => {
  clearTimeout(beat)
  clearTimeout(settle)
  counting?.stop()
})

const placementB = computed<Placement>(() => ({ ...start.value.b, scale: bScale.value }))

/** Mine is on show until I tap my own name; one other player's at a time joins it. */
const showMine = ref(true)
const otherUserId = ref<string | null>(null)

function select(userId: string): void {
  if (userId === props.mineUserId) showMine.value = !showMine.value
  else otherUserId.value = otherUserId.value === userId ? null : userId
}

const selected = computed(() =>
  [showMine.value && props.myScale !== null ? props.mineUserId : null, otherUserId.value].filter(
    (id): id is string => id !== null,
  ),
)

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

const other = computed(() =>
  props.rows.find((row) => row.userId === otherUserId.value && row.userId !== props.mineUserId),
)

const outlines = computed<Outline[]>(() => {
  const result: Outline[] = []
  if (props.myScale !== null && showMine.value) {
    result.push(myOutline(props.myScale))
  }
  if (other.value !== undefined) result.push(outlineAt(other.value.scale, other.value.colorHex))

  return result
})

/** The view holds A, the true B and every outline on show, so a tapped tip is never off-field. */
const view = computed(() => {
  const boxes: Box[] = [
    boxOf(props.payload.a, start.value.a),
    boxOf(props.payload.b, { ...start.value.b, scale: props.factor }),
  ]
  if (props.myScale !== null) {
    boxes.push(boxOf(props.payload.b, { ...start.value.b, scale: props.myScale }))
  }
  if (other.value !== undefined) {
    boxes.push(boxOf(props.payload.b, { ...start.value.b, scale: other.value.scale }))
  }

  return fitView(boxes, FIELD_PX)
})

function boxOf(s: MatchScalePayload['a'], p: Placement): Box {
  const { w, h } = sizeAt(s, p.scale)

  return { x: p.x, y: p.y, w, h }
}

/** Both silhouettes of a category often share one credit; show it once. */
const attributions = computed(() => [
  ...new Set(
    [props.payload.a.attribution, props.payload.b.attribution].filter(
      (text): text is string => text !== null,
    ),
  ),
])
</script>

<template>
  <div data-test="match-scale-reveal" class="flex flex-col gap-6">
    <div class="flex flex-col gap-3">
      <div class="flex justify-between gap-4 text-sm font-semibold">
        <span class="truncate" :style="{ color: A_COLOR }">{{ props.payload.a.name }}</span>
        <span class="truncate text-end" :style="{ color: B_COLOR }">
          {{ props.payload.b.name }}
        </span>
      </div>

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
        :b-hidden="!arrived"
        :camera="camera"
      />

      <p
        v-for="text in attributions"
        :key="text"
        data-test="match-scale-attribution"
        class="text-xs text-on-surface-variant"
      >
        {{ text }}
      </p>
    </div>

    <div class="-mb-3 flex justify-end">
      <SoundToggle
        class="flex size-11 cursor-pointer items-center justify-center rounded-full bg-surface-container text-on-surface"
        @click="unlockSound"
      />
    </div>

    <MatchScaleScoreboard
      :rows="props.rows"
      :live="props.live"
      :animate="props.animate"
      :selected="selected"
      :factor="props.factor"
      :tolerance-factor="props.payload.toleranceFactor"
      @select="select"
    />
  </div>
</template>
