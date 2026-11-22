<script setup lang="ts">
// Stands a poster in front of a round's card. The card lies mounted underneath, so the ramp
// covers exactly its box; a tap wakes the sound and the poster runs out.
//
//   up ──(tap)──▶ leaving ──(poster gone)──▶ gone      never back
//   up | leaving ──(scene turns null)──────▶ gone
import { useIntersectionObserver } from '@vueuse/core'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { unlockSound } from '@/ui/audio'
import { provideCurtain } from '@/ui/curtain'
import { gameSoundOn } from '@/ui/soundOutput'
import { soundOnStage } from '@/ui/useSoundAwake'
import BandPoster from './BandPoster.vue'
import type { RampScene } from './posterText'
import RasterPoster from './RasterPoster.vue'
import { posterOf, type PosterStyle } from './variation'

const props = defineProps<{ scene: RampScene | null }>()

const POSTERS: Record<PosterStyle, typeof BandPoster | typeof RasterPoster> = {
  band: BandPoster,
  raster: RasterPoster,
}

// Decided once: a scene that arrives later finds the card already in use.
const state = ref<'up' | 'leaving' | 'gone'>(props.scene === null ? 'gone' : 'up')

watch(
  () => props.scene,
  (scene) => {
    if (scene !== null) return

    // Focus on the poster would fall to `body` once it is gone.
    const hadFocus = ramp.value?.contains(document.activeElement) ?? false
    state.value = 'gone'
    if (hadFocus) void nextTick(() => card.value?.focus({ preventScroll: true }))
  },
)

provideCurtain(computed(() => state.value === 'gone'))

const poster = computed(() => (props.scene ? posterOf(props.scene.roundNumber) : null))

const ramp = useTemplateRef<HTMLElement>('ramp')
const card = useTemplateRef<HTMLElement>('card')

// Several rounds may share a page: only the poster on screen runs. Without the observer, assume
// it is on screen.
const inView = ref(typeof IntersectionObserver === 'undefined')
useIntersectionObserver(ramp, ([entry]) => {
  inView.value = entry?.isIntersecting ?? false
})

/** Still inside the tap: iOS wakes the sound nowhere else. */
function open(): void {
  // Waking claims the device's audio session: only where something would be heard.
  if (gameSoundOn() && soundOnStage.value) unlockSound()
  state.value = 'leaving'
}

async function gone(): Promise<void> {
  state.value = 'gone'

  // The card is usable only after this render; focus would land nowhere before.
  await nextTick()
  card.value?.focus({ preventScroll: true })
}
</script>

<template>
  <div class="grid grid-cols-1">
    <!-- `isolate`: the card's own z-index layers (cover, grid lines) must stay under the poster. -->
    <div
      ref="card"
      data-test="ramp-card"
      tabindex="-1"
      class="col-start-1 row-start-1 min-w-0 isolate"
      :class="{ invisible: state === 'up' }"
      :inert="state !== 'gone' || undefined"
    >
      <slot />
    </div>

    <!-- Stretched over the card's whole box, band included: what opens is what was covered.
         Clipped: a poster that runs out must not land on the page. -->
    <div
      v-if="state !== 'gone' && scene && poster"
      ref="ramp"
      data-test="ramp"
      class="round-bleed relative col-start-1 row-start-1 overflow-hidden sm:rounded-xl"
    >
      <component
        :is="POSTERS[poster.style]"
        v-bind="scene"
        :running="inView && state === 'up'"
        :tilt="poster.tilt"
        @open="open"
        @gone="gone"
      />
    </div>
  </div>
</template>
