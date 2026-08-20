<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AwardRule } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import SongSnippetBoard from './SongSnippetBoard.vue'
import SongSnippetReveal from './SongSnippetReveal.vue'
import { isSongSnippetPayload } from './types'
import type { SongSnippetSolution } from './types'
import type { SongSuggestion } from './api'

const props = defineProps<{
  payload: unknown
  outcome: unknown
  myGuess: unknown
  solution: unknown
  entries: GameEntry[]
  mineUserId: string | null
  awardRule: AwardRule | null
  disabled: boolean
  stage?: number
  assetUrl?: (key: number) => string
}>()

const emit = defineEmits<{ guess: [unknown]; skip: [number]; giveUp: [] }>()

const durations = computed(() =>
  isSongSnippetPayload(props.payload) ? props.payload.stageDurationsSeconds : [],
)
const revealed = computed(() => props.solution !== null && props.solution !== undefined)

/** A stage that grew without the play ending is exactly „falsch geraten oder geskippt“. */
const notice = ref<string | null>(null)
watch(
  () => props.stage ?? 0,
  (now, before) => {
    if (now > before && !revealed.value) notice.value = 'Falsch — nächste Stufe frei.'
  },
)

function onGuess(hit: SongSuggestion): void {
  notice.value = null
  emit('guess', { trackId: hit.trackId, artist: hit.artist, title: hit.title })
}
</script>

<template>
  <SongSnippetReveal
    v-if="revealed"
    :solution="solution as SongSnippetSolution"
    :durations="durations"
    :entries="entries"
    :mine-user-id="mineUserId"
    :asset-url="assetUrl"
  />
  <SongSnippetBoard
    v-else
    :durations="durations"
    :stage="stage ?? 0"
    :award-rule="awardRule"
    :disabled="disabled"
    :asset-url="assetUrl ?? (() => '')"
    :notice="notice"
    @guess="onGuess"
    @skip="emit('skip', $event)"
    @give-up="emit('giveUp')"
  />
</template>
