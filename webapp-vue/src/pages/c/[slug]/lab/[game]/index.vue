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
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useEventListener } from '@vueuse/core'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/useAuth'
import { useCommunityContext } from '@/communities/context'
import LabControls from '@/gamelab/LabControls.vue'
import { labRoster } from '@/gamelab/roster'
import { labGames } from '@/gamelab/games'
import { labRoundEnd, labRoundNumber } from '@/gamelab/header'
import { initialSeed, parseSeed, rollSeed } from '@/gamelab/seed'
import { phaseFrom, rampFrom, withPhase, withRamp } from '@/gamelab/options'
import { labShortcut } from '@/gamelab/shortcuts'
import { switchPlayerHref } from '@/gamelab/switchPlayer'
import {
  castLabVote,
  forgetMyLabEntry,
  giveUpLabRound,
  labAssets,
  openLabRound,
  resetLabRound,
  revealLabRound,
  setLabOverride,
  skipLabStage,
  submitLabGuess,
} from '@/gamelab/api'
import type { GameEntry } from '@/games/GameEntry'
import MemberRow from '@/members/MemberRow.vue'
import { SPOILER_HOLD_MS } from '@/members/useRoster'
import type { RoundReview } from '@/rounds/review'
import GameHeader from '@/ui/GameHeader.vue'
import RoundSurface from '@/ui/RoundSurface.vue'
import RoundRamp from '@/ui/ramp/RoundRamp.vue'
import { isEditableTarget } from '@/ui/editableTarget'
import { prefersReducedMotion } from '@/ui/motion'
import { nowMs, skewMs } from '@/ui/sharedClock'
import type { PlayClock } from '@/ui/playClock'
import type { RampScene } from '@/ui/ramp/posterText'
import type { RosterMemberResponse } from '@/api/types'
import type { LabPhase, LabRoundResponse } from '@/gamelab/types'

const route = useRoute('/c/[slug]/lab/[game]/')
const router = useRouter()
const { community } = useCommunityContext()
const { user } = useAuth()

const gameId = computed(() => String(route.params.game ?? ''))
const gameComponent = computed(() => labGames[gameId.value] ?? null)
const seed = computed(() => parseSeed(route.query.seed))
const phase = computed<LabPhase>(() => phaseFrom(route.query))
// Like the phase, in the URL: a reload and a shared link stand the same ramp.
const ramp = computed(() => rampFrom(route.query))

// Where a player switch comes back to: phase included, or the other tester's phase-two round is lost.
const returnPath = computed(() => `${route.path}?seed=${seed.value}&phase=${phase.value}`)

const round = ref<LabRoundResponse | null>(null)
/** The lab round's assets by name, the same shape a real round hands its game. */
const assets = computed(() =>
  round.value ? labAssets(community.value.slug, gameId.value, round.value) : undefined,
)
/**
 * Bumped whenever a response reseals an already-revealed round — a reset, most often. The game
 * component is keyed on this alongside `round.seed` (see below), because sealing again must
 * remount it: a half-made selection or an open panorama must not carry into the next attempt, the
 * way the old reveal screen unmounting the game used to guarantee for free.
 */
const resealCount = ref(0)
/**
 * Bumped when a response puts the round back in front of the tester: their entry is gone, or a
 * revealed round is sealed again. The `RoundRamp` is keyed on it, because it decides once at mount
 * and a spent ramp never returns on its own.
 */
const rampRaise = ref(0)
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

/**
 * When this tester's clock started. The lab has no server stamp on the wire and needs none —
 * nothing is scored here, the clock is there to be looked at. It doubles as the flag: the lab's
 * `me` stays null until a guess lands, so „stamped and still no me“ is exactly the play.
 */
const playStartedAt = ref<string | null>(null)

const labPlay = computed<PlayClock | null>(() => {
  const since = playStartedAt.value
  return since !== null && round.value?.me == null && round.value?.scoresOnDuration === true
    ? { phase: 'running', since }
    : null
})

function writeSeed(next: number): void {
  router.replace({ query: { ...route.query, seed: String(next) } })
}

// Same reasoning as the seed: the phase lives in the URL so a reload and a shared link show the
// same round.
function writePhase(next: LabPhase): void {
  router.replace({ query: withPhase(route.query, next) })
}

function writeRamp(on: boolean): void {
  router.replace({ query: withRamp(route.query, on) })
}

async function run(
  action: (slug: string, game: string, seed: number, phase: LabPhase) => Promise<LabRoundResponse>,
) {
  const current = seed.value
  if (current === null || !gameComponent.value) return
  busy.value = true
  error.value = null
  try {
    const wasRevealed = round.value?.revealed === true
    const hadEntry = round.value?.me != null
    round.value = await action(community.value.slug, gameId.value, current, phase.value)
    if (wasRevealed && !round.value.revealed) resealCount.value++
    if (
      ramp.value &&
      ((hadEntry && round.value.me == null) || (wasRevealed && !round.value.revealed))
    ) {
      rampRaise.value++
    }
    roundEndsAt.value = labRoundEnd(current, Date.now())
    // Every path that reopens a round — reset, „forget mine“, a new seed — comes back
    // `revealed: false` for a gated game, because the server clears its own `openedAt` on all of
    // them. So this one line retires the stamp on all of them too.
    if (!round.value.revealed) playStartedAt.value = null
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) unavailable.value = true
    else if (err instanceof ApiError && err.status === 409)
      error.value = 'Du hast in dieser Runde schon geraten — „Meinen Guess löschen“ räumt das weg.'
    else error.value = 'Die Aktion ist fehlgeschlagen.'
  } finally {
    busy.value = false
  }
}

/**
 * The poster stands only for a round the tester has not started: no entry, no running clock. The
 * same rule as a real card's, so the lab shows what a player would meet.
 */
const rampScene = computed<RampScene | null>(() => {
  const current = round.value
  if (!ramp.value || !current || current.me != null || labPlay.value !== null) return null

  const phaseTwo = current.awardRule === 'CLOSEST_ONLY'
  return {
    game: current.displayName,
    roundNumber: labRoundNumber(current.seed),
    phaseTwo,
    points: phaseTwo ? current.awardPoints : null,
  }
})

/**
 * The lab's own review. `canOverride` comes back `true` from the server — in the lab everybody is
 * the game master, which is the point of the harness. Seed and phase ride along because they are
 * the lab's round key, the same way a round number is the product's.
 */
const review = computed<RoundReview>(() => ({
  open: true,
  canOverride: round.value?.canOverride ?? false,
  vote: (userId, value) => run((slug, game, s, p) => castLabVote(slug, game, s, p, userId, value)),
  override: (userId, value) =>
    run((slug, game, s, p) => setLabOverride(slug, game, s, p, userId, value)),
}))

/**
 * Asked for by the game when its cover's hold completes — starts the tester's clock, mirroring
 * the real round's reveal.
 */
async function reveal(): Promise<void> {
  await run(revealLabRound)
  // `GameHeader` reads the stamp against the skew-corrected clock, not `Date.now()` — a raw
  // stamp would open the stopwatch at a non-zero reading (or clamped at 00:00) on a skewed clock.
  if (round.value?.revealed === true) {
    playStartedAt.value = new Date(nowMs.value + skewMs.value).toISOString()
  }
}

async function guess(value: unknown): Promise<void> {
  const current = seed.value
  if (current === null) return
  holdRoster = true
  await run((slug, game, s, p) => submitLabGuess(slug, game, s, p, value))
  // A failed guess brings no round, so the watcher never clears the hold for it.
  holdRoster = false
}

/**
 * The product's member row, fed from the lab round. Every response replaces it at once, except the
 * one a guess brings: that waits [SPOILER_HOLD_MS], as `useRoster.refreshAfterGuess` does on the
 * community page, so the row's reorder lands after the game's reveal rather than into it.
 */
const rosterMembers = ref<RosterMemberResponse[]>([])
let holdRoster = false
let rosterHold: ReturnType<typeof setTimeout> | undefined

watch(round, (current) => {
  if (!current) return
  const next = labRoster(current, user.value)
  clearTimeout(rosterHold)
  if (holdRoster && !prefersReducedMotion()) {
    rosterHold = setTimeout(() => (rosterMembers.value = next), SPOILER_HOLD_MS)
  } else {
    rosterMembers.value = next
  }
  holdRoster = false
})
onBeforeUnmount(() => clearTimeout(rosterHold))

/** Voluntary stage advance — same wrapping as `guess`, since `skipLabStage` also carries extra
 * arguments beyond `run`'s four-argument action shape. */
async function skip(fromStage: number, input?: unknown): Promise<void> {
  await run((slug, game, s, p) => skipLabStage(slug, game, s, p, fromStage, input))
}

useEventListener(document, 'keydown', (event: KeyboardEvent) => {
  if (busy.value) return
  const shortcut = labShortcut(event)
  if (!shortcut || isEditableTarget(event.target)) return

  event.preventDefault()
  if (shortcut === 'forgetMine') {
    void run(forgetMyLabEntry)
  } else if (shortcut === 'reset') {
    void run(resetLabRound)
  } else if (shortcut === 'roll') {
    writeSeed(rollSeed())
  } else if (shortcut === 'switchPlayer') {
    window.location.assign(switchPlayerHref(returnPath.value))
  }
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
      // A server from before steps sends none.
      steps: (current.mySteps ?? []).map((step) => step.input),
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
    <p class="text-sm text-on-surface-variant">In dieser Umgebung ist das Labor abgeschaltet.</p>
  </div>
  <div v-else-if="!gameComponent" data-test="lab-unknown-game" class="py-8 text-center">
    <h1 class="mb-2 text-lg font-semibold">Unbekanntes Spiel</h1>
    <p class="text-sm text-on-surface-variant">
      Für „{{ gameId }}“ gibt es im Labor nichts zu spielen.
    </p>
  </div>
  <div v-else-if="seed !== null">
    <p v-if="error" data-test="lab-error" class="mb-3 text-sm text-error">{{ error }}</p>

    <!-- The community page's row, same height reservation (see `pages/c/[slug]/index.vue`). -->
    <section class="flex min-h-[72px] items-center">
      <MemberRow v-if="rosterMembers.length" :members="rosterMembers" :me-id="user?.id" />
    </section>

    <!-- The ramp decides once at mount, so a fresh instance is the only way to stand it again: after
         a roll (`round.seed`), after the round went back to unplayed (`rampRaise`) and after the
         switch (`ramp`). -->
    <RoundRamp
      v-if="round"
      :key="`${round.seed}-${rampRaise}-${ramp}`"
      :scene="rampScene"
      class="mt-6"
    >
      <RoundSurface>
        <!-- The game's name lives in the band now, exactly as it does in a real round — that is the
           whole point of the lab wearing the product's header rather than a heading of its own.
           Its round number and its end are the lab's two inventions; both follow the seed. -->
        <template #header>
          <GameHeader
            :round-number="labRoundNumber(round.seed)"
            :title="round.displayName"
            :ends-at="roundEndsAt"
            :play="labPlay"
            :phase-two="round.awardRule === 'CLOSEST_ONLY'"
          />
        </template>
        <!--
        Keyed on `round.seed`, the seed the *response* carries, not the URL's — the two go out of
        step for one tick whenever rolling writes the new seed to the URL before the matching round
        has come back. Keying on the URL seed would remount right then, capturing the previous
        round's data as if it were the new one (the entrance animation starts from the wrong angle
        and never gets a second chance to run); `round.seed` only changes once the new round's data
        is actually here, so the remount and the data land together. The same remount also discards
        any uncommitted scratch state a game component keeps locally (a value typed but never
        submitted) once the round it belonged to is gone.

        `resealCount` rides along for the same reason: a reset keeps the seed but reseals the round,
        and without it the instance would survive the reseal — carrying a half-made selection or an
        open Weltanschauung panorama into the next attempt. Not keyed on `revealed` itself, which
        would also remount at the reveal and reload the map right when the clock starts.

        `closed` is bound rather than left out: a lab round is never over — it is rolled again, not
        closed — and the answer „false“ is the lab's, not an omission for the game to guess at.
      -->
        <component
          :is="gameComponent"
          :key="`${round.seed}-${resealCount}`"
          :sealed="!round.revealed"
          :scene="round.scene"
          :payload="round.payload"
          :outcome="round.me?.outcome ?? null"
          :my-guess="round.me?.guess ?? null"
          :solution="round.solution"
          :entries="gameEntries"
          :mine-user-id="gameMineUserId"
          :award-rule="round.awardRule"
          :award-points="round.awardPoints"
          :disabled="busy || round.me !== null"
          :stage="round.myStage"
          :steps="round.mySteps ?? []"
          :assets="assets"
          :review="review"
          :closed="false"
          @reveal="reveal"
          @guess="guess"
          @skip="skip"
          @give-up="run(giveUpLabRound)"
        />
      </RoundSurface>
    </RoundRamp>

    <section data-test="lab-controls" class="mt-8 border-t border-outline pt-4">
      <LabControls
        :seed="seed"
        :phase="phase"
        :busy="busy"
        :round-phase="round?.phase"
        :award-rule="round?.awardRule"
        :award-points="round?.awardPoints"
        :difficulty="round?.difficulty"
        :ramp="ramp"
        :return-path="returnPath"
        @apply="writeSeed"
        @roll="writeSeed(rollSeed())"
        @phase-change="writePhase"
        @ramp-change="writeRamp"
        @refresh="run(openLabRound)"
        @reset="run(resetLabRound)"
        @forget-mine="run(forgetMyLabEntry)"
      />
      <p data-test="lab-context" class="mt-3 text-xs text-on-surface-variant">
        Testrunde in „{{ community.name }}“
        <span v-if="round?.tookOverRound" data-test="lab-takeover" class="mt-1 block text-warning">
          Seed {{ seed }} hat die vorherige Test-Runde verworfen.
        </span>
      </p>
    </section>
  </div>
</template>
