<script setup lang="ts">
import { ref } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { searchSongs } from './api'
import type { SongSuggestion } from './api'

const SEARCH_DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 3

defineProps<{ disabled: boolean }>()
const emit = defineEmits<{ select: [SongSuggestion] }>()

const query = ref('')
const suggestions = ref<SongSuggestion[]>([])

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
    try {
      const hits = await searchSongs(q.trim(), abort.signal)
      if (mine === generation) suggestions.value = hits
    } catch {
      if (mine === generation) suggestions.value = []
    }
  },
  { debounce: SEARCH_DEBOUNCE_MS },
)

/**
 * Emptied, not filled with the pick: picking IS submitting the guess, so the field's next job is
 * the next guess — and an empty query cannot re-trigger the search the way the pick's own text
 * could. Bumping the generation makes an in-flight answer inert instead of repopulating a dropdown
 * the player already closed.
 */
function reset(): void {
  abort?.abort()
  generation++
  query.value = ''
  suggestions.value = []
}

function choose(hit: SongSuggestion): void {
  reset()
  emit('select', hit)
}
</script>

<template>
  <div class="relative">
    <input
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
      @click="reset()"
    >
      ×
    </button>
    <ul
      v-if="suggestions.length > 0"
      class="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg"
      data-test="song-suggestions"
    >
      <li v-for="hit in suggestions" :key="hit.trackId">
        <button
          type="button"
          class="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left hover:bg-neutral-50"
          @click="choose(hit)"
        >
          <img v-if="hit.coverUrl" :src="hit.coverUrl" alt="" class="h-8 w-8 rounded" />
          <span class="min-w-0">
            <span class="block truncate text-sm font-medium">{{ hit.title }}</span>
            <span class="block truncate text-xs text-neutral-500">{{ hit.artist }}</span>
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>
