<script setup lang="ts">
/**
 * The card after the round: the board's field, now read-only. B grows from my tip to the true
 * factor, my tip stays as a dashed outline at B's corner, and the scoreboard sits under it. A name
 * in the table lays that player's outline over the same corner; the same name again lifts it.
 *
 *   tip ──(SOLUTION_DELAY_MS)──▶ factor      B eases via CSS, no frame loop
 *
 * Nothing saved says where B stood when the tip went in, so every tip is drawn at B's starting
 * corner: sizes compare there, positions do not exist.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { SOLUTION_DELAY_MS, isStill } from '@/games/revealChoreography'
import { FIELD_PX, fitView, initialPlacements, sizeAt, type Box, type Placement } from './gestures'
import MatchScaleScoreboard from './MatchScaleScoreboard.vue'
import ScaleField, { type Outline } from './ScaleField.vue'
import { formatFactor, type ScoreboardRow } from './scoreboard'
import type { MatchScalePayload } from './types'

const props = defineProps<{
  payload: MatchScalePayload
  factor: number
  /** `null` without a tip of my own: history, onlookers. */
  myScale: number | null
  myColorHex: string
  mineUserId: string | null
  rows: ScoreboardRow[]
  live: boolean
  animate: boolean
}>()

const A_COLOR = 'var(--color-on-surface-variant)'

const start = computed(() => initialPlacements(props.payload.a))

const still = isStill(props.animate)

/** Where B is drawn: at my tip until the beat, then at the truth. Without a tip there is no start. */
const bScale = ref(still || props.myScale === null ? props.factor : props.myScale)

let beat: ReturnType<typeof setTimeout> | undefined

onMounted(() => {
  if (bScale.value === props.factor) return

  beat = setTimeout(() => {
    bScale.value = props.factor
  }, SOLUTION_DELAY_MS)
})

onBeforeUnmount(() => clearTimeout(beat))

const placementB = computed<Placement>(() => ({ ...start.value.b, scale: bScale.value }))

/** Another player's tip on show; mine always is. */
const selectedUserId = ref<string | null>(null)

function select(userId: string): void {
  selectedUserId.value = selectedUserId.value === userId ? null : userId
}

function outlineAt(scale: number, color: string): Outline {
  return { placement: { ...start.value.b, scale }, color, dashed: true }
}

const outlines = computed<Outline[]>(() => {
  const result: Outline[] = []
  if (props.myScale !== null) result.push(outlineAt(props.myScale, props.myColorHex))

  const other = props.rows.find(
    (row) => row.userId === selectedUserId.value && row.userId !== props.mineUserId,
  )
  if (other !== undefined) result.push(outlineAt(other.scale, other.colorHex))

  return result
})

/** The view holds A, the true B and my outline — and never moves while the others come and go. */
const view = computed(() => {
  const boxes: Box[] = [
    boxOf(props.payload.a, start.value.a),
    boxOf(props.payload.b, { ...start.value.b, scale: props.factor }),
  ]
  if (props.myScale !== null) {
    boxes.push(boxOf(props.payload.b, { ...start.value.b, scale: props.myScale }))
  }

  return fitView(boxes, FIELD_PX)
})

function boxOf(s: MatchScalePayload['a'], p: Placement): Box {
  const { w, h } = sizeAt(s, p.scale)

  return { x: p.x, y: p.y, w, h }
}

const attributions = computed(() =>
  [props.payload.a.attribution, props.payload.b.attribution].filter(
    (text): text is string => text !== null,
  ),
)
</script>

<template>
  <div data-test="match-scale-reveal" class="flex flex-col gap-6">
    <div class="flex flex-col gap-3">
      <div class="flex justify-between gap-4 text-sm font-semibold">
        <span class="truncate" :style="{ color: A_COLOR }">{{ props.payload.a.name }}</span>
        <span class="truncate text-end" :style="{ color: props.myColorHex }">
          {{ props.payload.b.name }}
        </span>
      </div>

      <ScaleField
        :a="props.payload.a"
        :b="props.payload.b"
        :a-color="A_COLOR"
        :b-color="props.myColorHex"
        :view="view"
        :placement-a="start.a"
        :placement-b="placementB"
        :outlines="outlines"
        :interactive="false"
        :grow="!still"
      />

      <p
        v-if="props.myScale !== null"
        data-test="match-scale-line"
        class="text-center text-sm text-on-surface"
      >
        Dein Tipp: {{ formatFactor(props.myScale) }}× · tatsächlich:
        {{ formatFactor(props.factor) }}×
      </p>
      <p v-else data-test="match-scale-line" class="text-center text-sm text-on-surface">
        Tatsächlich: {{ formatFactor(props.factor) }}×
      </p>

      <p
        v-for="text in attributions"
        :key="text"
        data-test="match-scale-attribution"
        class="text-xs text-on-surface-variant"
      >
        {{ text }}
      </p>
    </div>

    <MatchScaleScoreboard
      :rows="props.rows"
      :live="props.live"
      :animate="props.animate"
      :selected-user-id="selectedUserId"
      @select="select"
    />
  </div>
</template>
