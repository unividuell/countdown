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
import { computed, onMounted, onUnmounted, ref, toRef, useTemplateRef } from 'vue'
import IconMap from '~icons/lucide/map'
import IconMinimize from '~icons/lucide/minimize-2'
import SpotObjectCompass from './SpotObjectCompass.vue'
import SpotObjectCrosshair from './SpotObjectCrosshair.vue'
import SpotObjectMiniMap from './SpotObjectMiniMap.vue'
import type { SpotObjectTip } from './types'
import { useStreetView } from './useStreetView'

/** The ring's own radius: farther out than this, a press is a press on the map. */
const RING_RADIUS = 24
/** Movement a press may still carry before it counts as the start of a pan. */
const TAP_SLOP = 8
/** How long a press waits to find out whether it was the first half of a double click. */
const DOUBLE_TAP_MS = 280

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
  pegmanDragging,
  toPanorama,
  toStreetView,
  toWorldMap,
} = useStreetView(toRef(props, 'trailColor'))

/**
 * The map has three sizes and this is the middle one, kept as the *panel's* own flag rather than
 * as a state machine: whether a panorama is open is Google's answer, not ours, so the full-screen
 * size is simply `!pano.visible`. Leaving it standing while the map is full-screen is what makes
 * the way back land on the middle size again.
 */
const miniMapOpen = ref(false)

const miniMapVisible = computed(() => miniMapOpen.value && pano.visible)

const stage = useTemplateRef<HTMLElement>('stage')

onMounted(() => {
  if (!stage.value) return
  void mount(stage.value)
  watchCentreTap(stage.value)
})

onUnmounted(() => cancelPending())

/**
 * The press on the ring, read off the map itself rather than taken by a button on top of it.
 *
 * A button there is an opaque hit target, and the centre of a map is where the map's own gestures
 * live: a double click zooms, the wheel zooms, a drag pans. All three broke — the wheel one
 * scrolled the *page* instead. So the ring takes no pointer events at all, everything reaches
 * Google untouched, and only a press that is unmistakably ours is claimed back here.
 *
 * Unmistakably ours means: it did not travel, it landed inside the ring, and it is not part of a
 * run of presses. That last one cuts both ways — the first press of a double click has its action
 * cancelled by the second, and the second must schedule nothing of its own, or the double click
 * ends up doing what a single one does, only later.
 *
 * Captured, not bubbled: Google stops these events on their way up to run its own gestures, and
 * the stage is the outermost element, so its capture listener is the one nothing can sit in front
 * of.
 */
let pressedAt: { x: number; y: number } | null = null
let pending: ReturnType<typeof setTimeout> | null = null
/**
 * When the last press ended, so the next one can tell it is a repeat. Measured on the events' own
 * clock, and started at negative infinity so the very first press of a session is never one.
 */
let releasedAt = Number.NEGATIVE_INFINITY
let repeat = false

function cancelPending(): void {
  if (pending === null) return
  clearTimeout(pending)
  pending = null
}

function withinRing(element: HTMLElement, x: number, y: number): boolean {
  const box = element.getBoundingClientRect()
  return Math.hypot(x - (box.left + box.width / 2), y - (box.top + box.height / 2)) <= RING_RADIUS
}

function watchCentreTap(element: HTMLElement): void {
  element.addEventListener(
    'pointerdown',
    (event) => {
      cancelPending()
      repeat = event.timeStamp - releasedAt < DOUBLE_TAP_MS
      pressedAt = { x: event.clientX, y: event.clientY }
    },
    { capture: true },
  )

  element.addEventListener(
    'pointerup',
    (event) => {
      const from = pressedAt
      pressedAt = null
      releasedAt = event.timeStamp
      if (repeat) return
      if (from === null || props.disabled || pano.visible || pegmanDragging.value) return
      if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > TAP_SLOP) return
      if (!withinRing(element, event.clientX, event.clientY)) return

      pending = setTimeout(() => {
        pending = null
        toStreetView()
      }, DOUBLE_TAP_MS)
    },
    { capture: true },
  )
}

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
  <div class="relative h-[calc(100svh-6rem)] min-h-80 sm:h-[min(100dvh-6rem,40rem)] sm:min-h-0">
    <!-- `isolate`: the panorama's own chrome carries z-indexes in the millions, and without a
         stacking context here those compete with our overlay row in the ROOT context and win —
         the map mode's controls are modest enough that the row only vanishes once a panorama
         opens. Isolating traps them where they belong. -->
    <div ref="stage" data-test="spot-map" class="stage absolute inset-0 isolate bg-neutral-200" />

    <!-- The one mark, doing both jobs: on the map it is what the press below aims, in the panorama
         it is where the object belongs before „Gefunden“. The reveal lays the same mark over the
         stills, so what a player aimed at is what every reviewer looks at. -->
    <SpotObjectCrosshair />

    <!--
      The crosshair itself, pressed. A ring around the mark and nothing more: the mark is already
      the aim, the ring only says it can be touched. The second way in, not the only one — it
      reaches the 50 m `setPosition` is fixed at, and the Pegman covers everything past that.

      `pointer-events-none`, with the press read off the map by `watchCentreTap`: as a hit target
      this ring shadowed the map's own gestures at the one spot they matter most. It stays a real
      button all the same — focusable, and `@click` still fires from the keyboard, which is the one
      path no pointer gesture stands in for.

      Gone while the Pegman is in the air: it sits exactly where a dropped Pegman is most likely to
      land, and a ring around that spot reads as a target of its own.
    -->
    <button
      v-if="!pano.visible && !pegmanDragging"
      type="button"
      data-test="spot-enter"
      aria-label="Hier in Street View einsteigen"
      class="pointer-events-none absolute top-1/2 left-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80 shadow-[0_0_3px_rgba(0,0,0,0.5)] disabled:opacity-40"
      :disabled="props.disabled"
      @click="toStreetView"
    />

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
      <!-- Only in the panorama: on the world map, north is already up and the band would name a
           direction nobody is facing. -->
      <SpotObjectCompass v-if="pano.visible" :heading="heading ?? 0" />

      <slot />

      <div data-test="spot-actions" class="flex items-start justify-between gap-2 p-3">
        <!--
          The left slot is the map's size control, and it changes with the size: it opens the
          panel while a panorama is on screen, and brings the panorama back once the map has taken
          the whole board. Nothing at all before the first panorama — there is no size to step
          between yet, and this is where „Weltkarte“ used to be, which had the same rule.

          Only one control per step: the panel carries its own way down (✕) and its own way up (⤢),
          so this button is out of the way while the panel is open.
        -->
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

      <!-- Below the row it is opened from, and left-aligned under that button: the panel is the
           middle size of the same map, so it grows out of its own control rather than appearing
           somewhere else on the board. -->
      <SpotObjectMiniMap
        :open="miniMapVisible"
        :heading="heading ?? 0"
        :missed="jumpMissed"
        :color="props.trailColor"
        @shown="(element) => void openMiniMap(element)"
        @collapse="miniMapOpen = false"
        @expand="toWorldMap"
      />
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
