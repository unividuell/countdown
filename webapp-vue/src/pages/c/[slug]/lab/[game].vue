<script setup lang="ts">
/**
 * The game lab: play one mini-game against a seed taken from the URL, inside a real community,
 * with everything the tester produces held in the backend's memory.
 *
 * Not linked from anywhere on purpose. The SPA bundle is identical on staging and production, so
 * the page cannot know its environment — the server does, and answers 404 where the lab is off.
 * Having to know the URL is part of the access restriction, not an oversight.
 *
 * See docs/superpowers/specs/2026-08-08-game-lab-design.md.
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '@/api/client'
import { useCommunityContext } from '@/communities/context'
import LabControls from '@/gamelab/LabControls.vue'
import LabEntries from '@/gamelab/LabEntries.vue'
import { labGames } from '@/gamelab/games'
import { parseSeed, rollSeed } from '@/gamelab/seed'
import { forgetMyLabEntry, openLabRound, resetLabRound, submitLabGuess } from '@/gamelab/api'
import type { LabRoundResponse } from '@/gamelab/types'

const route = useRoute('/c/[slug]/lab/[game]')
const router = useRouter()
const { community } = useCommunityContext()

const gameId = computed(() => String(route.params.game ?? ''))
const gameComponent = computed(() => labGames[gameId.value] ?? null)
const seed = computed(() => parseSeed(route.query.seed))

const round = ref<LabRoundResponse | null>(null)
const unavailable = ref(false)
const error = ref<string | null>(null)
const busy = ref(false)

function writeSeed(next: number): void {
  router.replace({ query: { ...route.query, seed: String(next) } })
}

async function run(
  action: (slug: string, game: string, seed: number) => Promise<LabRoundResponse>,
) {
  const current = seed.value
  if (current === null || !gameComponent.value) return
  busy.value = true
  error.value = null
  try {
    round.value = await action(community.value.slug, gameId.value, current)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) unavailable.value = true
    else if (err instanceof ApiError && err.status === 409)
      error.value = 'Du hast in dieser Runde schon geraten — „Meinen Guess löschen" räumt das weg.'
    else error.value = 'Die Aktion ist fehlgeschlagen.'
  } finally {
    busy.value = false
  }
}

async function guess(value: unknown): Promise<void> {
  const current = seed.value
  if (current === null) return
  await run((slug, game) => submitLabGuess(slug, game, current, value))
}

// The seed is the single source of truth. An absent or unusable one is repaired into the URL
// before anything is loaded, so a reload always replays exactly the same round.
watch(
  seed,
  (current) => {
    if (current === null) {
      writeSeed(rollSeed())
      return
    }
    void run(openLabRound)
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="unavailable" data-test="lab-unavailable" class="py-8 text-center">
    <h1 class="mb-2 text-lg font-semibold">Spiel-Labor nicht verfügbar</h1>
    <p class="text-sm text-neutral-600">In dieser Umgebung ist das Labor abgeschaltet.</p>
  </div>
  <div v-else-if="!gameComponent" data-test="lab-unknown-game" class="py-8 text-center">
    <h1 class="mb-2 text-lg font-semibold">Unbekanntes Spiel</h1>
    <p class="text-sm text-neutral-600">Für „{{ gameId }}" gibt es im Labor nichts zu spielen.</p>
  </div>
  <div v-else-if="seed !== null">
    <h1 class="mb-1 text-lg font-semibold">{{ round?.displayName ?? 'Spiel-Labor' }}</h1>
    <p class="mb-4 text-sm text-neutral-600">Testrunde in „{{ community.name }}"</p>

    <LabControls
      :seed="seed"
      :busy="busy"
      :return-path="`${route.path}?seed=${seed}`"
      @apply="writeSeed"
      @roll="writeSeed(rollSeed())"
      @refresh="run(openLabRound)"
      @reset="run(resetLabRound)"
      @forget-mine="run(forgetMyLabEntry)"
    />

    <p
      v-if="round?.tookOverRound"
      data-test="lab-takeover"
      class="mb-3 rounded-md bg-amber-50 p-2 text-sm text-amber-900"
    >
      Test-Runde auf Seed {{ seed }} umgestellt — der vorherige Stand wurde verworfen.
    </p>
    <p v-if="error" data-test="lab-error" class="mb-3 text-sm text-red-700">{{ error }}</p>

    <component
      :is="gameComponent"
      v-if="round"
      :payload="round.payload"
      :outcome="round.me?.outcome ?? null"
      :disabled="busy || round.me !== null"
      @guess="guess"
    />

    <LabEntries :entries="round?.others ?? []" />
  </div>
</template>
