<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AwardRule } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import SongSnippetBoard from './SongSnippetBoard.vue'
import SongSnippetReveal from './SongSnippetReveal.vue'
import { scoreRows } from './scoreboard'
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

/**
 * Worked out here rather than in the reveal card, the way Guess Hue does it: this is the place that
 * already turns `unknown` into something typed, and it leaves the card as pure composition.
 */
const rows = computed(() =>
  scoreRows({
    entries: props.entries,
    durations: durations.value,
    awardRule: props.awardRule,
  }),
)
/** A score nobody can overtake any more is not live — so the chip follows the rows, not the rule. */
const live = computed(() => rows.value.some((row) => row.provisional))

/** A stage that grew without the play ending is „falsch geraten“ — unless the growth was our own
 *  skip, flagged below before the re-emit so the watch can tell the two apart. */
const notice = ref<string | null>(null)
let skipPending = false
watch(
  () => props.stage ?? 0,
  (now, before) => {
    if (now <= before || revealed.value) return
    if (skipPending) {
      skipPending = false
      return
    }
    notice.value = 'Falsch — nächste Stufe frei.'
  },
)

function onGuess(hit: SongSuggestion): void {
  notice.value = null
  // A skip whose request never landed (a raced 409) leaves its flag standing; clearing it here
  // keeps that stale flag from swallowing the verdict on this guess.
  skipPending = false
  emit('guess', { trackId: hit.trackId, artist: hit.artist, title: hit.title })
}

function onSkip(fromStage: number): void {
  skipPending = true
  emit('skip', fromStage)
}
</script>

<template>
  <SongSnippetReveal
    v-if="revealed"
    :solution="solution as SongSnippetSolution"
    :durations="durations"
    :rows="rows"
    :live="live"
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
    @skip="onSkip"
    @give-up="emit('giveUp')"
  />
</template>
