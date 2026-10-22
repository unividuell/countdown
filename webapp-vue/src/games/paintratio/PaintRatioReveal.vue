<script setup lang="ts">
/**
 * The card after the round: the canvas with its layers, and the scoreboard under it.
 *
 *   ┌──────────────────────┐
 *   │  picture + paintings │  the Kollektiv's picture; a tapped name lays its painting on top
 *   └──────────────────────┘
 *    Auswertung …
 *
 * Beats come from `revealChoreography`: my own painting stands as I signed it, then at
 * `SOLUTION_DELAY_MS` it fades into the picture. The scoreboard carries its own beats.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { FADE_MS, SOLUTION_DELAY_MS, isStill } from '@/games/revealChoreography'
import { useRevealArming } from '@/ui/useRevealArming'
import LayerCanvas from './LayerCanvas.vue'
import { DEFAULT_LAYERS, KOLLEKTIV, toggleLayer } from './layers'
import PaintRatioScoreboard from './PaintRatioScoreboard.vue'
import type { CanvasLayer } from './render'
import type { ScoreRow } from './scoreboard'
import type { PaintRatioPayload, PaintRatioSolution, Stroke } from './types'

const props = defineProps<{
  payload: PaintRatioPayload
  solution: PaintRatioSolution
  templateSrc: string | null
  rows: ScoreRow[]
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** False when this card was already the reveal on arrival: a reload shows the finished table. */
  animate: boolean
  mineUserId: string | null
}>()

const selected = ref<string[]>([...DEFAULT_LAYERS])

/** The paintings that can be laid on the canvas, by user id. */
const paintings = computed(() => {
  const byId = new Map<string, Stroke[]>()
  for (const row of props.rows) {
    if (row.strokes !== null) byId.set(row.userId, row.strokes)
  }

  return byId
})

/** A selected painting whose row is gone is skipped — rows keep arriving while the round is live. */
const layers = computed<CanvasLayer[]>(() =>
  selected.value.flatMap((id): CanvasLayer[] => {
    if (id === KOLLEKTIV) return [{ kind: 'template' }]

    const strokes = paintings.value.get(id)
    return strokes === undefined ? [] : [{ kind: 'strokes', strokes }]
  }),
)

const own = computed(() =>
  props.mineUserId === null ? undefined : paintings.value.get(props.mineUserId),
)

/**
 * Whether my painting stands over the picture until the solution beat. Asked once, on arrival:
 * without a painting of mine, or without beats, the reveal simply shows the picture.
 */
const intro = !isStill(props.animate) && own.value !== undefined

const ownLayers = computed<CanvasLayer[]>(() =>
  own.value === undefined ? [] : [{ kind: 'strokes', strokes: own.value }],
)

const faded = ref(false)
let solutionTimer: ReturnType<typeof setTimeout> | undefined

// Without an intro there is no beat to arm.
useRevealArming(!intro, () => {
  solutionTimer = setTimeout(() => (faded.value = true), SOLUTION_DELAY_MS)
})

onBeforeUnmount(() => clearTimeout(solutionTimer))

function select(id: string): void {
  selected.value = toggleLayer(selected.value, id)
}
</script>

<template>
  <div data-test="paint-ratio-reveal" class="flex flex-col gap-6">
    <!-- Card-wide: the negative margins cancel RoundSurface's padding, as on the board. -->
    <div
      class="relative -mx-4 -mt-4 bg-white"
      :style="{ aspectRatio: `${props.payload.width} / ${props.payload.height}` }"
    >
      <LayerCanvas
        class="absolute inset-0"
        :width="props.payload.width"
        :height="props.payload.height"
        :brushes="props.payload.brushes"
        :layers="layers"
        :template-src="props.templateSrc"
      />
      <!-- Over the picture, then transparent: the fade is this canvas leaving, not a redraw. -->
      <LayerCanvas
        v-if="intro"
        data-test="paint-ratio-own"
        class="absolute inset-0 transition-opacity"
        :style="{ opacity: faded ? 0 : 1, transitionDuration: `${FADE_MS}ms` }"
        :width="props.payload.width"
        :height="props.payload.height"
        :brushes="props.payload.brushes"
        :layers="ownLayers"
        :template-src="null"
      />
    </div>

    <PaintRatioScoreboard
      :rows="props.rows"
      :live="props.live"
      :animate="props.animate"
      :selected="selected"
      :target-ratio="props.solution.targetRatio"
      :tolerance="props.solution.tolerance"
      @select="select"
    />
  </div>
</template>
