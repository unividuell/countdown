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
 * the verdict the picture fades in under it. The scoreboard carries its own beats.
 *
 *   ┌──────────────────────┐        ┌──────────────────────┐
 *   │  my painting         │  ───▶  │  picture             │
 *   │                      │        │   + my painting      │
 *   └──────────────────────┘        └──────────────────────┘
 */
import { computed, ref } from 'vue'
import { FADE_MS } from '@/games/revealChoreography'
import { provideRevealTimeline } from '@/games/revealTimeline'
import { useSoundStage } from '@/ui/useSoundAwake'
import LayerCanvas from './LayerCanvas.vue'
import { KOLLEKTIV, openingLayers, toggleLayer } from './layers'
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
  /** Whether my tip earns the success sound (`myWin`); `null` plays nothing. */
  won: boolean | null
}>()

const timeline = provideRevealTimeline({ animate: props.animate, won: () => props.won })

// The verdict is governed by the header's sound switch, which wakes the graph while it is here.
useSoundStage()

/** The paintings that can be laid on the canvas, by user id. */
const paintings = computed(() => {
  const byId = new Map<string, Stroke[]>()
  for (const row of props.rows) {
    if (row.strokes !== null) byId.set(row.userId, row.strokes)
  }

  return byId
})

const own = computed(() =>
  props.mineUserId === null ? undefined : paintings.value.get(props.mineUserId),
)

/** Both of us start marked: the picture and, when I have one, my painting on it. */
const selected = ref<string[]>(openingLayers(own.value === undefined ? null : props.mineUserId))

/** A selected painting whose row is gone is skipped — rows keep arriving while the round is live. */
const layers = computed<CanvasLayer[]>(() =>
  selected.value.flatMap((id): CanvasLayer[] => {
    if (id === KOLLEKTIV) return [{ kind: 'template' }]

    const strokes = paintings.value.get(id)
    return strokes === undefined ? [] : [{ kind: 'strokes', strokes }]
  }),
)

/**
 * Whether my painting stands alone until the solution beat. Asked once, on arrival: without a
 * painting of mine, or without beats, the reveal shows the finished picture at once.
 */
const intro = !timeline.still && own.value !== undefined

const ownLayers = computed<CanvasLayer[]>(() =>
  own.value === undefined ? [] : [{ kind: 'strokes', strokes: own.value }],
)

const faded = ref(false)

// The picture judges: it shows with the verdict.
if (intro) timeline.on('verdict', () => (faded.value = true))

function select(id: string): void {
  selected.value = toggleLayer(selected.value, id)
}
</script>

<template>
  <div data-test="paint-ratio-reveal" class="flex flex-col gap-6">
    <!-- Inside the gutter, as on the board: the painting must not jump between the two. -->
    <div
      class="relative bg-surface-container"
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
      <!-- My painting alone, over the same painting on the picture: as this canvas leaves, the
           picture fades in under the painting, which does not move. -->
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
      :selected="selected"
      :target-ratio="props.solution.targetRatio"
      :tolerance="props.solution.tolerance"
      @select="select"
    />
  </div>
</template>
