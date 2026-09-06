<script setup lang="ts">
/**
 * The hits and the field that finds them, in that order down the card: a band of covers where the
 * question mark used to stand, and the field below it in the slot the reveal fills with the title
 * and the artist.
 *
 * Deliberately not a dropdown, and deliberately above the field: an overlay opens over the rest of
 * the card, and on a phone it lands under the thumb — worse, the on-screen keyboard covers exactly
 * the hits the player is trying to read. Above the field, the keyboard has nothing to hide. The band
 * also puts the cover the player picks in the same place the solution's cover appears later, so
 * choosing and being told happen at one spot on the screen.
 *
 * One row, scrolling sideways, every hit the endpoint returned. The cover carries the identifying
 * weight, with title and artist written over its foot on white so they stay legible whatever the
 * artwork does.
 */
import { computed, ref, watch } from 'vue'
import { watchDebounced } from '@vueuse/core'
import TickerLine from './TickerLine.vue'
import { searchSongs } from './api'
import type { SongSuggestion } from './api'

const SEARCH_DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 3

defineProps<{ disabled: boolean }>()
const emit = defineEmits<{ select: [SongSuggestion] }>()

const query = ref('')
const suggestions = ref<SongSuggestion[]>([])
/** True from the moment a request goes out until its answer lands — the placeholder then spins. */
const searching = ref(false)
/** True once an answer came back with nothing in it: the one empty band that has something to say. */
const foundNothing = ref(false)
const field = ref<HTMLInputElement | null>(null)
const band = ref<HTMLElement | null>(null)

/** Only the newest answer may win — the routeData/useProfileDraft guard. */
let generation = 0
let abort: AbortController | null = null

watchDebounced(
  query,
  async (q) => {
    abort?.abort()
    foundNothing.value = false
    if (q.trim().length < MIN_QUERY_LENGTH) {
      suggestions.value = []
      return
    }
    const mine = ++generation
    abort = new AbortController()
    searching.value = true
    try {
      const found = await searchSongs(q.trim(), abort.signal)
      if (mine === generation) {
        suggestions.value = found
        foundNothing.value = found.length === 0
      }
    } catch {
      // A failed request is not an empty result: the band stays mute rather than claiming the song
      // does not exist.
      if (mine === generation) suggestions.value = []
    } finally {
      // Only the newest request may put the spinners away; an aborted one leaves them to its
      // successor.
      if (mine === generation) searching.value = false
    }
  },
  { debounce: SEARCH_DEBOUNCE_MS },
)

/**
 * A new set of hits is read from the left: whatever the player scrolled to belonged to the previous
 * search, and leaving the band parked there hides the very hits that just arrived. After the DOM has
 * taken them, so the band is measured against its new content and not the old one.
 */
watch(
  suggestions,
  () => {
    if (band.value !== null) band.value.scrollLeft = 0
  },
  { flush: 'post' },
)

/**
 * Emptied, not filled with the pick: picking IS submitting the guess, so the field's next job is
 * the next guess — and an empty query cannot re-trigger the search the way the pick's own text
 * could. Bumping the generation makes an in-flight answer inert instead of repopulating a band the
 * player already emptied.
 */
function reset(): void {
  abort?.abort()
  generation++
  query.value = ''
  suggestions.value = []
  searching.value = false
  foundNothing.value = false
}

/**
 * Clearing must not cost the field its focus: on a phone the on-screen keyboard folds away with it
 * and the player has to tap the field again to keep typing. `pointerdown.prevent` stops the button
 * from taking focus in the first place — the click still arrives — and the explicit `focus()` puts
 * it back for any path that got through anyway.
 */
function clearAndKeepTyping(): void {
  reset()
  field.value?.focus()
}

function choose(hit: SongSuggestion): void {
  reset()
  emit('select', hit)
}

/** Every hit, however many came back — the endpoint's limit decides that, not the layout. */
const hits = computed(() => suggestions.value)
</script>

<template>
  <!-- Two rows with the card's own spacing, so the band and the field land exactly where the reveal
       puts the cover and the title. -->
  <div class="flex flex-col gap-4">
    <!-- With its scrollbar showing: sideways it takes nothing away from the covers, and it is the
         only affordance a mouse has for a strip that scrolls. -->
    <div ref="band" class="flex gap-1 overflow-x-auto" data-test="song-suggestions">
      <!-- Artwork and caption stacked, not overlaid. An overlay looks the same — the white is
           opaque either way — but it gets clipped out of the tile's rounded corners while the cover
           behind it still paints there, which left a dark crescent in both bottom corners of every
           dark cover. Stacked, those corners belong to the tile's own white and there is nothing
           behind them to show through. -->
      <button
        v-for="hit in hits"
        :key="hit.trackId"
        type="button"
        data-test="song-hit"
        class="song-cover flex aspect-square shrink-0 cursor-pointer flex-col overflow-hidden rounded-xl bg-white"
        :aria-label="`${hit.title} von ${hit.artist} tippen`"
        @click="choose(hit)"
      >
        <span class="min-h-0 flex-1 overflow-hidden bg-neutral-200">
          <img v-if="hit.coverUrl" :src="hit.coverUrl" alt="" class="h-full w-full object-cover" />
        </span>
        <span class="px-1.5 py-1 text-left">
          <TickerLine :text="hit.title" class="text-xs leading-snug font-medium" />
          <TickerLine :text="hit.artist" class="text-xs leading-snug text-neutral-500" />
        </span>
      </button>
      <!-- Exactly one, and only while there is nothing to show: it holds the band's height so the
           field and the bar below never move, and it is the whole state of the search — spinning
           while a request is out, naming an empty answer, mute before the first one. Slots that
           merely padded the band out to a fixed length read as hits still loading, which is a lie
           whenever the search already answered. -->
      <span
        v-if="hits.length === 0"
        class="song-cover flex aspect-square shrink-0 items-center justify-center rounded-xl bg-neutral-50 text-xs text-neutral-400"
        data-test="song-band-placeholder"
      >
        <span
          v-if="searching"
          class="size-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-500 motion-reduce:animate-none"
          data-test="song-hit-spinner"
        />
        <template v-else-if="foundNothing">Keine Treffer</template>
      </span>
    </div>

    <!-- The slot the reveal gives to the title and the artist; the field stands centred in it, so
         the bar below sits at the same height on both screens. -->
    <div class="flex h-12 items-center">
      <div class="relative w-full">
        <input
          ref="field"
          v-model="query"
          type="text"
          data-test="song-search"
          class="h-11 w-full rounded-full border border-neutral-300 bg-white pr-11 pl-4 text-sm"
          placeholder="Song suchen und tippen…"
          :disabled="disabled"
        />
        <button
          v-if="query.length > 0"
          type="button"
          data-test="song-search-clear"
          class="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center text-lg text-neutral-400 hover:text-neutral-600"
          aria-label="Eingabe löschen"
          @pointerdown.prevent
          @click="clearAndKeepTyping()"
        >
          ×
        </button>
      </div>
    </div>
  </div>
</template>
