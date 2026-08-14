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

const awardText = computed<string | null>(() => {
  const points = props.round?.me?.points ?? null
  if (points === null) return null
  const noun = points === 1 ? 'Punkt' : 'Punkte'
  return props.round?.awardRule === 'CLOSEST_ONLY'
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
  <div data-test="round-card" class="rounded-xl border border-neutral-200 bg-white p-6">
    <p v-if="notice" data-test="round-notice" class="mb-4 text-sm text-amber-700">{{ notice }}</p>

    <div v-if="stage === 'sealed'" class="flex flex-col items-center gap-4 text-center">
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

    <template v-else-if="stage === 'playing' || stage === 'done'">
      <p v-if="component === null" data-test="round-unrenderable" class="text-sm text-neutral-600">
        Für „{{ round?.game?.displayName }}“ gibt es in dieser Version noch keine Ansicht.
      </p>
      <component
        :is="component"
        v-else
        :payload="round?.payload"
        :outcome="round?.me?.outcome ?? null"
        :my-guess="round?.me?.guess ?? null"
        :solution="round?.solution"
        :entries="entries"
        :mine-user-id="round?.me?.userId ?? null"
        :disabled="busy || stage === 'done'"
        @guess="onGuess"
      />
    </template>

    <p v-if="awardText !== null" data-test="round-award" class="mt-4 text-sm text-neutral-600">
      {{ awardText }}
    </p>
  </div>
</template>
