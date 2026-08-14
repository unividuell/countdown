<script setup lang="ts">
/**
 * Renders the round the page already fetched. The card holds no state of its own — what it shows
 * follows entirely from the `round`/`stage`/`busy`/`notice` props and the `reveal`/`submit`
 * callbacks the page hands down from its single `useRound` call (see
 * `src/pages/c/[slug]/index.vue` for why the page, not this card, owns that call).
 */
import { computed } from 'vue'
import type { Component } from 'vue'
import type { RoundResponse } from '@/api/types'
import type { RoundStage } from '@/rounds/useRound'
import type { GameEntry } from '@/games/GameEntry'
import { gameComponents } from '@/games/registry'

const props = defineProps<{
  round: RoundResponse | null
  stage: RoundStage
  busy: boolean
  notice: string | null
  reveal: () => Promise<void>
  submit: (guess: unknown) => Promise<void>
}>()

const emit = defineEmits<{ guessed: [] }>()

/** `null` for a game the server announced that this build has no renderer for — an operational
 * state (a build lagging the content), not a player error. */
const component = computed<Component | null>(() => {
  const id = props.round?.game?.id
  return id === undefined ? null : (gameComponents[id] ?? null)
})

/** Mine first, then everyone else's — the order the reading wheel expects. */
const entries = computed<GameEntry[]>(() => {
  const me = props.round?.me ?? null
  const others = props.round?.others ?? []
  return me ? [me, ...others] : others
})

/**
 * The provisional clause only holds for a score that could still be overtaken. In `CLOSEST_ONLY`
 * a `0` is final — deviations freeze once guessed, and the best any later guess can do is get
 * closer, never worse — so a `0` gets its own, non-provisional sentence instead of the general
 * one appended to every positive score.
 */
const awardText = computed<string | null>(() => {
  const points = props.round?.me?.points ?? null
  if (points === null) return null
  const closestOnly = props.round?.awardRule === 'CLOSEST_ONLY'
  if (points === 0) {
    return closestOnly ? 'Kein Punkt — ein anderer Tipp lag näher.' : 'Kein Punkt diesmal.'
  }
  const noun = points === 1 ? 'Punkt' : 'Punkte'
  return closestOnly
    ? `Du hast ${points} ${noun} — bester Tipp bisher, das kann sich noch ändern.`
    : `Du hast ${points} ${noun}.`
})

async function onReveal(): Promise<void> {
  await props.reveal()
}

/**
 * `submit` never rejects — a failed or raced attempt lands in `notice` instead (see `useRound`'s
 * `run`) — so whether the guess actually went through is read off `notice` staying `null` after
 * the await, not off a resolved promise.
 */
async function onGuess(value: unknown): Promise<void> {
  await props.submit(value)
  if (props.notice === null) emit('guessed')
}
</script>

<template>
  <!--
    No chrome at this level: the game component brings its own bordered frame (see
    GuessHueBoard/GuessHueReveal), so the sealed and the unrenderable face carry the frame
    themselves — the only two faces that are not already framed by something else — and the
    playing/done face renders the game bare, exactly as the lab page does. A card inside a card
    reads as clutter and, on a phone, costs the wheel width to a doubled padding.
  -->
  <div data-test="round-card">
    <p v-if="notice" data-test="round-notice" class="mb-4 text-sm text-amber-700">{{ notice }}</p>

    <!-- Checked ahead of `stage`, not inside a `stage === 'sealed'` branch only: a sealed round
         for a game this build cannot render is just as unrenderable as a playing one — offering
         "Aufdecken" first and admitting the gap only afterwards would be the same lie one step
         later. -->
    <p
      v-if="component === null"
      data-test="round-unrenderable"
      class="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600"
    >
      Für „{{ round?.game?.displayName }}“ gibt es in dieser Version noch keine Ansicht.
    </p>

    <div
      v-else-if="stage === 'sealed'"
      class="flex flex-col items-center gap-4 rounded-xl border border-neutral-200 bg-white p-6 text-center"
    >
      <p class="text-base font-semibold text-neutral-900">{{ round?.game?.displayName }}</p>
      <button
        type="button"
        data-test="round-reveal"
        class="h-11 w-full cursor-pointer rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:cursor-default disabled:opacity-40"
        :disabled="busy"
        @click="onReveal"
      >
        Aufdecken
      </button>
    </div>

    <component
      :is="component"
      v-else-if="stage === 'playing' || stage === 'done'"
      :payload="round?.payload"
      :outcome="round?.me?.outcome ?? null"
      :my-guess="round?.me?.guess ?? null"
      :solution="round?.solution"
      :entries="entries"
      :mine-user-id="round?.me?.userId ?? null"
      :disabled="busy || stage === 'done'"
      @guess="onGuess"
    />

    <p v-if="awardText !== null" data-test="round-award" class="mt-4 text-sm text-neutral-600">
      {{ awardText }}
    </p>
  </div>
</template>
