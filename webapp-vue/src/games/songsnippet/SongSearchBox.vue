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
const selected = ref<SongSuggestion | null>(null)

/** Only the newest answer may win — the routeData/useProfileDraft guard. */
let generation = 0
let abort: AbortController | null = null

/**
 * The exact text `choose()` last wrote into `query`. Compared against the *settled* value the
 * debounced watcher sees, not against the write itself: a one-shot "skip the next callback" flag
 * would misfire here, because `watchDebounced` coalesces bursts — if the user keeps typing within
 * the debounce window right after a pick, the callback that finally fires reflects that *later*
 * edit, not the pick's own write, and a one-shot flag would wrongly swallow it. Comparing text
 * instead answers the actual question — "is the query still exactly what was just picked?" — no
 * matter how many writes happened in between.
 */
let selectedLabel = ''

watchDebounced(
  query,
  async (q) => {
    // The pick's own text landing in `query` must not re-search or reopen the dropdown — but any
    // edit away from it (even back to the same text is treated as a fresh choice) is real input.
    if (selected.value !== null && q === selectedLabel) return
    selected.value = null
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

function choose(hit: SongSuggestion): void {
  selected.value = hit
  selectedLabel = `${hit.artist} — ${hit.title}`
  query.value = selectedLabel
  suggestions.value = []
  emit('select', hit)
}
</script>

<template>
  <div class="relative">
    <input
      v-model="query"
      type="text"
      data-test="song-search"
      class="h-11 w-full rounded-full border border-neutral-300 bg-white px-4 text-sm"
      placeholder="Song suchen…"
      :disabled="disabled"
    />
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
