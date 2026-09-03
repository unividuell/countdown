<script setup lang="ts">
/**
 * The board: the world map, and — once a panorama is open — the ground the player walks. The map
 * fills the whole surface; the two controls float over its top corners so they never compete for
 * space with the thing that has to be searchable. The term is not here — `SpotObjectGame` puts it
 * above both faces, so it reads the same while searching and while judging.
 *
 * Knows nothing about the round or the lab — it is told whether it is locked, and it hands back
 * the view the open panorama is showing. Everything Google lives in `useStreetView`, the press
 * that walks into a panorama included: it is the map's own click event now, on both maps, rather
 * than a control of ours floating over the map's centre.
 */
import { computed, onMounted, ref, toRef, useTemplateRef } from 'vue'
import IconMap from '~icons/lucide/map'
import IconMinimize from '~icons/lucide/minimize-2'
import SpotObjectCompass from './SpotObjectCompass.vue'
import SpotObjectCrosshair from './SpotObjectCrosshair.vue'
import SpotObjectMiniMap from './SpotObjectMiniMap.vue'
import type { SpotObjectTip } from './types'
import { useStreetView } from './useStreetView'

const props = defineProps<{ disabled: boolean; trailColor: string }>()

const emit = defineEmits<{ guess: [tip: SpotObjectTip] }>()

const {
  currentTip,
  error,
  heading,
  jumpMissed,
  mount,
  noCoverage,
  openMiniMap,
  pano,
  toPanorama,
  toWorldMap,
} = useStreetView({ trailColor: toRef(props, 'trailColor'), locked: toRef(props, 'disabled') })

/**
 * The map has three sizes and this is the middle one, kept as the *panel's* own flag rather than
 * as a state machine: whether a panorama is open is Google's answer, not ours, so the full-screen
 * size is simply `!pano.visible`. Leaving it standing while the map is full-screen is what makes
 * the way back land on the middle size again.
 */
const miniMapOpen = ref(false)

const miniMapVisible = computed(() => miniMapOpen.value && pano.visible)

const stage = useTemplateRef<HTMLElement>('stage')
/** The room the mini-map may be dragged around in. */
const board = useTemplateRef<HTMLElement>('board')

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
  <!--
    A phone gets the viewport less a 6rem band, and that band is the whole rule: the stage is
    shorter than the screen, so no scroll position can hide it, and there is always somewhere to
    start a page scroll — inside the map every drag pans instead. At the top of the page it is the
    card header above; scrolled past that, whatever follows the card below.

    Measuring the board's own top and fitting the rest of it into one screenful — what this did
    before — meant the app header, the card header and the gaps between them all came out of the
    map: about 230px of a 700px phone, so the map got three fifths of a screen while the band below
    it went unused. The chrome above scrolls away; the map does not have to pay for it.

    6rem, not the 3rem this started at, and the reason is the hand rather than the arithmetic: 3rem
    of it lands on the bottom screen edge, where the browser's own toolbar and edge gestures are, so
    it is reached for and does nothing. Measured on a phone: a 48px band read as no band at all.

    `svh` is the viewport with the browser's toolbars out — checked on the browser suspected of
    getting it wrong, Firefox for Android, which reports 779 against an `lvh` of 844, exactly its
    65px URL bar. `dvh` would be the same number until the bar hides, and would then resize the map
    on every change of scroll direction.

    `min-h`: below that the map is useless anyway, and overflowing beats a letterbox.
  -->
  <div
    ref="board"
    class="relative h-[calc(100svh-6rem)] min-h-80 sm:h-[min(100dvh-6rem,40rem)] sm:min-h-0"
  >
    <!-- `isolate`: the panorama's own chrome carries z-indexes in the millions, and without a
         stacking context here those compete with our overlay row in the ROOT context and win —
         the map mode's controls are modest enough that the row only vanishes once a panorama
         opens. Isolating traps them where they belong. -->
    <div ref="stage" data-test="spot-map" class="stage absolute inset-0 isolate bg-neutral-200" />

    <!-- Only in the panorama, where it is the one thing it was always for: the centre the object
         belongs in before „Gefunden“, and the mark the reveal lays over the stills so that what a
         player aimed at is what every reviewer looks at. On the map it used to be a target as
         well, and that job is gone — a press lands where the finger is, not where the map is
         centred. -->
    <SpotObjectCrosshair v-if="pano.visible" />

    <!-- The blue lines are the answer, so the notice points at them rather than apologising. -->
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
      <!-- Only in the panorama: on the world map, north is already up and the band would name a
           direction nobody is facing. -->
      <SpotObjectCompass v-if="pano.visible" :heading="heading ?? 0" />

      <slot />

      <div data-test="spot-actions" class="flex items-start justify-between gap-2 p-3">
        <!--
          The left slot is the map, at whatever size it currently has: the icon that opens the
          panel, the panel itself, or — once the map has taken the whole board — the way back into
          the panorama. All three start at this one corner, which is where „Weltkarte“ used to be.

          The panel is only ever hidden, never unmounted: Google measures a `display:none` element
          as nothing, so a rebuilt container would come back as a grey square. That is also why it
          cannot take part in the `v-if` chain below it.

          Only one control per step: the panel carries its own way down and its own way up, so the
          icon is out of the way while the panel is open.
        -->
        <!-- `shrink-0`: „Gefunden“ must never squeeze the map on a narrow phone. -->
        <div class="shrink-0">
          <SpotObjectMiniMap
            :open="miniMapVisible"
            :missed="jumpMissed"
            :bounds="board"
            @shown="(element) => void openMiniMap(element)"
            @collapse="miniMapOpen = false"
            @expand="toWorldMap"
          />

          <button
            v-if="pano.visible && !miniMapOpen"
            type="button"
            data-test="spot-mini-open"
            aria-label="Übersichtskarte öffnen"
            class="pointer-events-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white text-neutral-900 shadow disabled:cursor-default disabled:opacity-40"
            :disabled="props.disabled"
            @click="miniMapOpen = true"
          >
            <IconMap aria-hidden="true" class="h-5 w-5" />
          </button>
          <button
            v-else-if="!pano.visible && pano.panoId"
            type="button"
            data-test="spot-street-view"
            aria-label="Zurück zur Straßenansicht"
            class="pointer-events-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white text-neutral-900 shadow disabled:cursor-default disabled:opacity-40"
            :disabled="props.disabled"
            @click="toPanorama"
          >
            <IconMinimize aria-hidden="true" class="h-5 w-5" />
          </button>
        </div>

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

<!--
  The Pegman's size is not in the Maps API — `streetViewControlOptions` takes a position and
  nothing else — so this reaches for Google's own element by class. Deliberately a scale and
  nothing more: if that class ever changes, the control comes back at its stock size, which is
  the state this started from rather than a broken map.
-->
<style scoped>
.stage :deep(.gm-svpc) {
  transform: scale(1.35);
  transform-origin: center right;
}
</style>
