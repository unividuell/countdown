<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GameEmits, GameProps } from '@/games/GameProps'
import { useRevealedLive } from '@/games/useRevealedLive'
import SongSnippetBoard from './SongSnippetBoard.vue'
import SongSnippetReveal from './SongSnippetReveal.vue'
import { scoreRows } from './scoreboard'
import { asSongSnippetPayload, asSongSnippetSolution } from './types'
import type { SongSuggestion } from './api'

const props = defineProps<GameProps>()

const emit = defineEmits<GameEmits>()

const payload = computed(() => asSongSnippetPayload(props.payload))
const durations = computed(() => payload.value?.stageDurationsSeconds ?? [])

// A solution it cannot read leaves the board standing, as in every other game.
const solution = computed(() => asSongSnippetSolution(props.solution))
const revealed = computed(() => solution.value !== null)

/**
 * Worked out here rather than in the reveal card, the way Guess Hue does it: this is the place that
 * already turns `unknown` into something typed, and it leaves the card as pure composition.
 */
const rows = computed(() =>
  scoreRows({
    entries: props.entries,
    durations: durations.value,
    awardRule: props.awardRule,
    mineUserId: props.mineUserId,
  }),
)
/** „Live“ is the round's rule, not a per-row question — the rows carry their own `provisional`. */
const live = computed(() => props.awardRule === 'CLOSEST_ONLY')

const hasRevealedLive = useRevealedLive(revealed)

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
  <p v-if="payload === null" class="text-sm text-neutral-600">
    Diese Runde lässt sich hier nicht anzeigen.
  </p>
  <SongSnippetReveal
    v-else-if="solution"
    :solution="solution"
    :durations="durations"
    :rows="rows"
    :live="live"
    :animate="hasRevealedLive"
    :assets="assets"
  />
  <SongSnippetBoard
    v-else
    :durations="durations"
    :stage="stage ?? 0"
    :award-rule="awardRule"
    :award-points="awardPoints"
    :disabled="disabled"
    :assets="assets ?? null"
    :notice="notice"
    @guess="onGuess"
    @skip="onSkip"
    @give-up="emit('giveUp')"
  />
</template>
