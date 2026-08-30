<script setup lang="ts">
/**
 * The board: the world map, and — once a panorama is open — the ground the player walks. The map
 * fills the whole surface; the two controls float over its top corners so they never compete for
 * space with the thing that has to be searchable. The term is not here — `SpotObjectGame` puts it
 * above both faces, so it reads the same while searching and while judging.
 *
 * Knows nothing about the round or the lab — it is told whether it is locked, and it hands back
 * the view the open panorama is showing. Everything Google lives in `useStreetView`.
 */
import { onMounted, useTemplateRef } from 'vue'
import { useViewportFill } from '@/ui/useViewportFill'
import IconArrowLeft from '~icons/lucide/arrow-left'
import IconPegman from '~icons/lucide/person-standing'
import SpotObjectCrosshair from './SpotObjectCrosshair.vue'
import type { SpotObjectTip } from './types'
import { useStreetView } from './useStreetView'

/** Page left free below the map, so a phone still has somewhere to start a scroll. */
const STRIP = 48
/** Below this the map is useless anyway, and overflowing beats a letterbox. */
const MIN_HEIGHT = 320

const props = defineProps<{ disabled: boolean }>()

const emit = defineEmits<{ guess: [tip: SpotObjectTip] }>()

const { currentTip, error, mount, noCoverage, pano, toStreetView, toWorldMap } = useStreetView()

const stage = useTemplateRef<HTMLElement>('stage')
const frame = useTemplateRef<HTMLElement>('frame')
const filled = useViewportFill(frame, { strip: STRIP, min: MIN_HEIGHT })

onMounted(() => {
  if (stage.value) void mount(stage.value)
})

// Asked at the click, not read off state: the direction the player turned to is the tip.
function submitGuess(): void {
  const tip: SpotObjectTip | null = currentTip()
  if (tip) emit('guess', tip)
}
</script>

<template>
  <div
    ref="frame"
    class="relative h-[var(--stage-height)] sm:h-[min(100dvh-6rem,40rem)]"
    :style="{ '--stage-height': filled === null ? '100dvh' : `${filled}px` }"
  >
    <!-- `isolate`: the panorama's own chrome carries z-indexes in the millions, and without a
         stacking context here those compete with our overlay row in the ROOT context and win —
         the map mode's controls are modest enough that the row only vanishes once a panorama
         opens. Isolating traps them where they belong. -->
    <div ref="stage" data-test="spot-map" class="stage absolute inset-0 isolate bg-neutral-200" />

    <!-- The one mark, doing both jobs: on the map it is where the Pegman lands, in the panorama it
         is where the object belongs before „Gefunden“. The reveal lays the same mark over the
         stills, so what a player aimed at is what every reviewer looks at. -->
    <SpotObjectCrosshair />

    <!--
      The Pegman as a press rather than a drag. A drag on a phone puts the finger on top of the
      spot being aimed at, so the target is invisible for the whole gesture; here the crosshair
      holds the aim and the thumb only confirms it. Right edge, vertically centred: reachable
      without crossing the map, and out of the way of both top corners.
    -->
    <button
      v-if="!pano.visible"
      type="button"
      data-test="spot-enter"
      aria-label="Hier in Street View einsteigen"
      class="absolute top-1/2 right-3 flex h-12 w-12 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white text-neutral-900 shadow disabled:cursor-default disabled:opacity-40"
      :disabled="props.disabled"
      @click="toStreetView"
    >
      <IconPegman aria-hidden="true" class="h-6 w-6" />
    </button>

    <!-- Right under the crosshair, because it is about that exact point. The blue lines are the
         answer, so the notice points at them rather than apologising. -->
    <p
      v-if="noCoverage"
      data-test="spot-no-coverage"
      class="pointer-events-none absolute top-1/2 left-1/2 mt-8 w-max max-w-[80%] -translate-x-1/2 rounded-full bg-neutral-900/80 px-3 py-1.5 text-center text-xs text-white"
    >
      Keine Aufnahme hier — ziel auf eine blaue Linie.
    </p>

    <div
      v-if="error"
      data-test="spot-error"
      class="absolute inset-0 flex items-center justify-center bg-white/95 p-6 text-center"
    >
      <p class="text-sm text-neutral-700">
        Die Karte konnte nicht geladen werden. Versuch es später noch einmal.
      </p>
    </div>

    <!--
      Everything of ours stacks down from the top edge, never up from the bottom: the whole bottom
      band belongs to Google. Its logo is fixed bottom-left in both the map and the panorama and
      cannot be moved or hidden, the „Map data ©… / Terms“ text sits bottom-right — covering any of
      it breaks the terms of service.

      The slot is the round's term. It rides here rather than above the board so that searching
      spends the whole card on the map, while the reveal — where there is no map to spend it on —
      puts the same band in the card's own flow. One component, one look, two places.

      `pointer-events-none` throughout, re-armed per control: a gap between two pills must pan the
      map, not swallow the gesture, and the term band must not swallow it either.
    -->
    <div class="pointer-events-none absolute inset-x-0 top-0 flex flex-col">
      <slot />

      <div data-test="spot-actions" class="flex items-start justify-between gap-2 p-3">
        <!-- Left, and an arrow: this is the back action of the pair, and back belongs where every
           other back control on a phone is. The word stays beside the arrow — „Weltkarte“ is the
           destination, and an arrow alone would not say which back. -->
        <button
          v-if="pano.visible"
          type="button"
          data-test="spot-world-map"
          class="pointer-events-auto flex h-11 cursor-pointer items-center gap-1.5 rounded-full bg-white pr-4 pl-3 text-sm font-medium text-neutral-900 shadow disabled:cursor-default disabled:opacity-40"
          :disabled="props.disabled"
          @click="toWorldMap"
        >
          <IconArrowLeft aria-hidden="true" class="h-4 w-4" />
          Weltkarte
        </button>
        <span v-else />

        <button
          type="button"
          data-test="spot-guess-button"
          class="pointer-events-auto h-11 cursor-pointer rounded-full bg-neutral-900 px-4 text-sm font-medium text-white shadow disabled:cursor-default disabled:opacity-40"
          :disabled="props.disabled || !pano.visible"
          @click="submitGuess"
        >
          Gefunden
        </button>
      </div>
    </div>
  </div>
</template>
