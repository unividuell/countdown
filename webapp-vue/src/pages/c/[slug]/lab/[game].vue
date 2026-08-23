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
import { useEventListener } from '@vueuse/core'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '@/api/client'
import { useCommunityContext } from '@/communities/context'
import LabControls from '@/gamelab/LabControls.vue'
import LabEntries from '@/gamelab/LabEntries.vue'
import { labGames } from '@/gamelab/games'
import { initialSeed, parseSeed, rollSeed } from '@/gamelab/seed'
import { labShortcut } from '@/gamelab/shortcuts'
import {
  forgetMyLabEntry,
  giveUpLabRound,
  labAssetUrl,
  openLabRound,
  resetLabRound,
  skipLabStage,
  submitLabGuess,
} from '@/gamelab/api'
import { requestDrawerClose } from '@/nav/drawerControl'
import RoundSurface from '@/ui/RoundSurface.vue'
import type { LabEntryDto, LabPhase, LabRoundResponse } from '@/gamelab/types'

const route = useRoute('/c/[slug]/lab/[game]')
const router = useRouter()
const { community } = useCommunityContext()

const gameId = computed(() => String(route.params.game ?? ''))
const gameComponent = computed(() => labGames[gameId.value] ?? null)
const seed = computed(() => parseSeed(route.query.seed))
// Anything other than exactly `TWO` reads as `ONE` — the lab is a dev tool, so a junk `?phase=`
// value is visible at a glance rather than an error state, and every link that predates this
// selector keeps opening phase one.
const phase = computed<LabPhase>(() => (route.query.phase === 'TWO' ? 'TWO' : 'ONE'))

const round = ref<LabRoundResponse | null>(null)
const unavailable = ref(false)
const error = ref<string | null>(null)
const busy = ref(false)

function writeSeed(next: number): void {
  router.replace({ query: { ...route.query, seed: String(next) } })
}

// Same reasoning as the seed: the phase lives in the URL so a reload and a shared link show the
// same round.
function writePhase(next: LabPhase): void {
  router.replace({ query: { ...route.query, phase: next } })
}

async function run(
  action: (slug: string, game: string, seed: number, phase: LabPhase) => Promise<LabRoundResponse>,
  closeDrawer = false,
) {
  const current = seed.value
  if (current === null || !gameComponent.value) return
  busy.value = true
  error.value = null
  try {
    round.value = await action(community.value.slug, gameId.value, current, phase.value)
    if (closeDrawer) requestDrawerClose()
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) unavailable.value = true
    else if (err instanceof ApiError && err.status === 409)
      error.value = 'Du hast in dieser Runde schon geraten — „Meinen Guess löschen“ räumt das weg.'
    else error.value = 'Die Aktion ist fehlgeschlagen.'
  } finally {
    busy.value = false
  }
}

async function guess(value: unknown): Promise<void> {
  const current = seed.value
  if (current === null) return
  await run((slug, game, s, p) => submitLabGuess(slug, game, s, p, value))
}

/** Voluntary stage advance — same wrapping as `guess`, since `skipLabStage` also carries one extra
 * argument beyond `run`'s four-argument action shape. */
async function skip(fromStage: number): Promise<void> {
  await run((slug, game, s, p) => skipLabStage(slug, game, s, p, fromStage))
}

useEventListener(document, 'keydown', (event: KeyboardEvent) => {
  if (busy.value) return
  const shortcut = labShortcut(event)
  if (!shortcut) return

  // `closest`, not `matches`: inside a rich-text host the event target is whichever inline element
  // the caret sits in, and only its ancestor carries `contenteditable`.
  const target = event.target
  if (
    target instanceof Element &&
    target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
  ) {
    return
  }

  event.preventDefault()
  if (shortcut === 'forgetMine') {
    void run(forgetMyLabEntry, true)
  } else if (shortcut === 'reset') {
    void run(resetLabRound, true)
  }
})

/**
 * The complete picture of the round: the viewer's own entry first, then everyone else's. The
 * backend withholds `others` until the viewer has guessed, so before that this is empty — `me` is
 * the only thing ever populated ahead of it.
 */
const entries = computed<LabEntryDto[]>(() => {
  const current = round.value
  if (!current) return []
  return current.me ? [current.me, ...current.others] : current.others
})

// The seed is the single source of truth. An absent or unusable one is repaired into the URL
// before anything is loaded, so a reload always replays exactly the same round. Phase is a second
// source for the same open: switching it must reopen the round exactly like a new seed does,
// because it is the other half of the round key on the server's side.
watch(
  [seed, phase],
  ([current]) => {
    if (current === null) {
      writeSeed(initialSeed(gameId.value))
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
    <p class="text-sm text-neutral-600">Für „{{ gameId }}“ gibt es im Labor nichts zu spielen.</p>
  </div>
  <div v-else-if="seed !== null">
    <!-- Everything that only exists because this is a lab lives in the nav drawer, not here. A
         game review judges the look of the page as much as the game, so the content column must
         hold nothing a real player would not see. `defer` lets the drawer's container mount
         first; without it the teleport would race the drawer on a cold load. -->
    <Teleport defer to="#drawer-page-tools">
      <LabControls
        :seed="seed"
        :phase="phase"
        :busy="busy"
        :round-phase="round?.phase"
        :award-rule="round?.awardRule"
        :award-points="round?.awardPoints"
        :return-path="`${route.path}?seed=${seed}&phase=${phase}`"
        @apply="writeSeed"
        @roll="writeSeed(rollSeed())"
        @phase-change="writePhase"
        @refresh="run(openLabRound, true)"
        @reset="run(resetLabRound, true)"
        @forget-mine="run(forgetMyLabEntry, true)"
      />
      <p data-test="lab-context" class="px-5 pt-2 pb-3 text-xs text-neutral-500">
        Testrunde in „{{ community.name }}“
        <span
          v-if="round?.tookOverRound"
          data-test="lab-takeover"
          class="mt-1 block text-amber-700"
        >
          Seed {{ seed }} hat die vorherige Test-Runde verworfen.
        </span>
      </p>
    </Teleport>

    <!-- The heading is the GAME's, not the lab's — a real game page carries its title the same
         way, so it stays in the column. Everything lab-shaped went into the drawer above. -->
    <h1 class="mb-4 text-lg font-semibold">{{ round?.displayName ?? 'Spiel-Labor' }}</h1>

    <!-- Stays in the column: an error is the one thing that must not wait behind a closed
         drawer, and it is absent whenever the page is worth looking at. -->
    <p v-if="error" data-test="lab-error" class="mb-3 text-sm text-red-700">{{ error }}</p>

    <RoundSurface v-if="round">
      <!--
        Keyed on `round.seed`, the seed the *response* carries, not the URL's — the two go out of
        step for one tick whenever rolling writes the new seed to the URL before the matching round
        has come back. Keying on the URL seed would remount right then, capturing the previous
        round's data as if it were the new one (the entrance animation starts from the wrong angle
        and never gets a second chance to run); `round.seed` only changes once the new round's data
        is actually here, so the remount and the data land together. The same remount also discards
        any uncommitted scratch state a game component keeps locally (a value typed but never
        submitted) once the round it belonged to is gone.
      -->
      <component
        :is="gameComponent"
        :key="round.seed"
        :payload="round.payload"
        :outcome="round.me?.outcome ?? null"
        :my-guess="round.me?.guess ?? null"
        :solution="round.solution"
        :entries="entries"
        :mine-user-id="round.me?.userId ?? null"
        :award-rule="round.awardRule"
        :disabled="busy || round.me !== null"
        :stage="round.myStage"
        :asset-url="
          (key: number) => labAssetUrl(community.slug, gameId, round?.seed ?? 0, phase, key)
        "
        @guess="guess"
        @skip="skip"
        @give-up="run(giveUpLabRound)"
      />
    </RoundSurface>

    <!-- No drawer close on these two: they are triggered from the column, where nothing is in
         the way of the result. -->
    <LabEntries
      :entries="entries"
      :mine-user-id="round?.me?.userId ?? null"
      :busy="busy"
      @forget-mine="run(forgetMyLabEntry)"
      @reset="run(resetLabRound)"
    />
  </div>
</template>
