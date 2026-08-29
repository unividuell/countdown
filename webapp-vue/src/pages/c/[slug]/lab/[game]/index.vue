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
import type { RouteLocationRaw } from 'vue-router'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/useAuth'
import { useCommunityContext } from '@/communities/context'
import LabControls from '@/gamelab/LabControls.vue'
import LabEntries from '@/gamelab/LabEntries.vue'
import { labGames } from '@/gamelab/games'
import { labRoundEnd, labRoundNumber } from '@/gamelab/header'
import { initialSeed, parseSeed, rollSeed } from '@/gamelab/seed'
import { labShortcut } from '@/gamelab/shortcuts'
import {
  forgetMyLabEntry,
  giveUpLabRound,
  labAssetUrl,
  openLabRound,
  resetLabRound,
  revealLabRound,
  skipLabStage,
  submitLabGuess,
} from '@/gamelab/api'
import { requestDrawerClose } from '@/nav/drawerControl'
import type { GameEntry } from '@/games/GameEntry'
import GameHeader from '@/ui/GameHeader.vue'
import RoundSurface from '@/ui/RoundSurface.vue'
import type { LabEntryDto, LabPhase, LabRoundResponse } from '@/gamelab/types'

const route = useRoute('/c/[slug]/lab/[game]/')
const router = useRouter()
const { community } = useCommunityContext()
const { user } = useAuth()

const gameId = computed(() => String(route.params.game ?? ''))
const gameComponent = computed(() => labGames[gameId.value] ?? null)
const seed = computed(() => parseSeed(route.query.seed))
// Anything other than exactly `TWO` reads as `ONE` — the lab is a dev tool, so a junk `?phase=`
// value is visible at a glance rather than an error state, and every link that predates this
// selector keeps opening phase one.
const phase = computed<LabPhase>(() => (route.query.phase === 'TWO' ? 'TWO' : 'ONE'))

/** Where one of this round's tiles opens — seed and phase ride along because they are the lab's
 * round key, the same way the real round's tip path carries its round number. */
const tipPath = (userId: string): RouteLocationRaw => ({
  name: '/c/[slug]/lab/[game]/tips/[userId]',
  params: { slug: community.value.slug, game: gameId.value, userId },
  query: { seed: String(seed.value), phase: phase.value },
})

const round = ref<LabRoundResponse | null>(null)
/**
 * When this test round closes. Stamped once per open rather than derived per render: an end that
 * moved along with the clock would hold the band's readout at one reading forever, and a band that
 * never counts down is worse than no band at all. Everything else about it follows the seed, so a
 * reload replays the same round with only the seconds moved on.
 */
const roundEndsAt = ref<string | null>(null)
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
    roundEndsAt.value = labRoundEnd(current, Date.now())
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

/** The lab's own „Aufdecken“ — starts the tester's clock, mirroring the real round's reveal. */
async function reveal(): Promise<void> {
  await run(revealLabRound)
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
 * The complete picture of the round, as the server actually stored it — the viewer's own entry
 * first, then everyone else's. Feeds `LabEntries`, which shows exactly the raw wire values; a
 * synthesised row would misrepresent what is really in the database.
 */
const entries = computed<LabEntryDto[]>(() => {
  const current = round.value
  if (!current) return []
  return current.me ? [current.me, ...current.others] : current.others
})

/**
 * What the game component gets as `entries`/`mineUserId`. In a real round a stage that reveals
 * before it scores (Musterung's phase two) creates the viewer's own play row the moment they see
 * the board, tinted in their colour — `guess`/`outcome`/`points` null until they act. The lab has
 * no reveal step of its own: `round.me` stays null until a guess lands, so without this the game
 * finds no row for `mineUserId`, and colours the viewer's own outline with the grey fallback while
 * they are still playing. This is not a fabricated guess — it is the same „revealed, not yet
 * guessed“ state a real reveal would have produced, built from the tester's own identity.
 */
const gameMineUserId = computed(() => round.value?.me?.userId ?? user.value?.id ?? null)
const gameEntries = computed<GameEntry[]>(() => {
  const current = round.value
  if (!current) return []
  if (current.me) return [current.me, ...current.others]
  if (!user.value) return current.others
  return [
    {
      userId: user.value.id,
      username: user.value.username,
      stage: current.myStage,
      guess: null,
      outcome: null,
      points: null,
      durationMs: null,
      avatar: user.value.avatar,
      votes: [],
      struck: false,
      adminOverride: null,
    },
    ...current.others,
  ]
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

    <!-- Stays in the column: an error is the one thing that must not wait behind a closed
         drawer, and it is absent whenever the page is worth looking at. -->
    <p v-if="error" data-test="lab-error" class="mb-3 text-sm text-red-700">{{ error }}</p>

    <RoundSurface v-if="round">
      <!-- The game's name lives in the band now, exactly as it does in a real round — that is the
           whole point of the lab wearing the product's header rather than a heading of its own.
           Its round number and its end are the lab's two inventions; both follow the seed. -->
      <template #header>
        <GameHeader
          :round-number="labRoundNumber(round.seed)"
          :title="round.displayName"
          :ends-at="roundEndsAt"
        />
      </template>
      <!--
        Same face and the same sentence as the real round's `sealed` (`RoundCard.vue`) — the lab
        mirrors it rather than inventing a second wording. Absent for a game that never asked for a
        deliberate reveal: `round.revealed` is already `true` for those from the first response, so
        this branch never renders and the game mounts straight away, exactly as before this gate
        existed.
      -->
      <div
        v-if="!round.revealed"
        data-test="lab-sealed"
        class="sealed-face flex flex-col items-center justify-center gap-4 text-center"
      >
        <p data-test="lab-reveal-cost" class="text-sm text-neutral-600">
          Deine Zeit läuft ab dem Aufdecken — und du hast nur <strong>einen</strong> Versuch.
        </p>
        <button
          type="button"
          data-test="lab-reveal"
          class="h-11 w-full cursor-pointer rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:cursor-default disabled:opacity-40"
          :disabled="busy"
          @click="reveal"
        >
          Aufdecken
        </button>
      </div>

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
        v-else
        :key="round.seed"
        :payload="round.payload"
        :outcome="round.me?.outcome ?? null"
        :my-guess="round.me?.guess ?? null"
        :solution="round.solution"
        :entries="gameEntries"
        :mine-user-id="gameMineUserId"
        :award-rule="round.awardRule"
        :disabled="busy || round.me !== null"
        :stage="round.myStage"
        :asset-url="
          (key: number) => labAssetUrl(community.slug, gameId, round?.seed ?? 0, phase, key)
        "
        :tip-path="tipPath"
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
