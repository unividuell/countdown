<script setup lang="ts">
/**
 * The search field and, under it, a strip that always occupies the same height — four square slots
 * the hits appear in. Deliberately not a dropdown: an overlay that opens over the rest of the card
 * is awkward on a phone, where it lands under the thumb and hides the very bar it covers.
 *
 * Three to a row, and every hit the endpoint returned — which it keeps to a multiple of three, so
 * the last row fills up (see `DeezerSongCatalog.SEARCH_LIMIT`). Three rather than four because a
 * quarter of a phone leaves a cover too small to read a title over. The cover carries the
 * identifying weight, with title and artist written over its foot on white so they stay legible
 * whatever the artwork does.
 */
import { computed, ref, watch } from 'vue'
import { watchDebounced } from '@vueuse/core'
import TickerLine from './TickerLine.vue'
import { searchSongs } from './api'
import type { SongSuggestion } from './api'

const SEARCH_DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 3
const PER_ROW = 3
/** Rows the strip fills with slots. The box shows two and a sliver of the third; the rest scrolls. */
const ROWS = 3

defineProps<{ disabled: boolean }>()
const emit = defineEmits<{ select: [SongSuggestion] }>()

const query = ref('')
const suggestions = ref<SongSuggestion[]>([])
/** True from the moment a request goes out until its answer lands — the empty slots then spin. */
const searching = ref(false)
const field = ref<HTMLInputElement | null>(null)
const box = ref<HTMLElement | null>(null)

/** Only the newest answer may win — the routeData/useProfileDraft guard. */
let generation = 0
let abort: AbortController | null = null

watchDebounced(
  query,
  async (q) => {
    abort?.abort()
    if (q.trim().length < MIN_QUERY_LENGTH) {
      suggestions.value = []
      return
    }
    const mine = ++generation
    abort = new AbortController()
    searching.value = true
    try {
      const hits = await searchSongs(q.trim(), abort.signal)
      if (mine === generation) suggestions.value = hits
    } catch {
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
 * A new set of hits is read from its first row: whatever the player scrolled down to belonged to the
 * previous search, and leaving the box parked there hides the very hits that just arrived. After the
 * DOM has taken them, so the box is measured against its new content and not the old one.
 */
watch(
  suggestions,
  () => {
    if (box.value !== null) box.value.scrollTop = 0
  },
  { flush: 'post' },
)

/**
 * Emptied, not filled with the pick: picking IS submitting the guess, so the field's next job is
 * the next guess — and an empty query cannot re-trigger the search the way the pick's own text
 * could. Bumping the generation makes an in-flight answer inert instead of repopulating a strip
 * the player already emptied.
 */
function reset(): void {
  abort?.abort()
  generation++
  query.value = ''
  suggestions.value = []
  searching.value = false
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
/**
 * The empty slots after them: enough to hold [ROWS] open when the strip is empty, and enough to
 * finish the last row when more hits arrive than that.
 */
const blanks = computed(() => {
  const rows = Math.max(ROWS, Math.ceil(hits.value.length / PER_ROW))
  return rows * PER_ROW - hits.value.length
})
</script>

<template>
  <div>
    <div class="relative">
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

    <!-- Three rows of slots in a box two and a fifth rows tall: `aspect-[15/11]` is exactly that
         (three square columns are 3 wide by 1 tall per row, so 2.2 rows = 3 : 2.2 = 15 : 11), which
         keeps the height proportional on any width. The sliver of the third row is what says „there
         is more" — the scrollbar itself is hidden so the grid keeps the card's full width. -->
    <div
      ref="box"
      class="scrollbar-hidden mt-2 aspect-[15/11] overflow-y-auto"
      data-test="song-suggestions-box"
    >
      <div class="grid grid-cols-3 gap-px" data-test="song-suggestions">
        <button
          v-for="hit in hits"
          :key="hit.trackId"
          type="button"
          data-test="song-hit"
          class="relative aspect-square cursor-pointer overflow-hidden rounded-sm bg-neutral-200"
          :aria-label="`${hit.title} von ${hit.artist} tippen`"
          @click="choose(hit)"
        >
          <img v-if="hit.coverUrl" :src="hit.coverUrl" alt="" class="h-full w-full object-cover" />
          <span class="absolute inset-x-0 bottom-0 bg-white px-1 py-0.5 text-left">
            <TickerLine :text="hit.title" class="text-xs leading-snug font-medium" />
            <TickerLine :text="hit.artist" class="text-xs leading-snug text-neutral-500" />
          </span>
        </button>
        <span
          v-for="blank in blanks"
          :key="`blank-${blank}`"
          class="flex aspect-square items-center justify-center rounded-sm bg-neutral-50"
          data-test="song-hit-blank"
        >
          <!-- One per waiting slot, so the strip itself says a search is out. -->
          <span
            v-if="searching"
            class="size-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-500 motion-reduce:animate-none"
            data-test="song-hit-spinner"
          />
        </span>
      </div>
    </div>
  </div>
</template>
