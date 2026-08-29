<script setup lang="ts">
/**
 * Renders the round the page already fetched. The card holds no state of its own — what it shows
 * follows entirely from the `round`/`stage`/`busy`/`notice` props and the `reveal`/`submit`
 * callbacks the page hands down from its single `useRound` call (see
 * `src/pages/c/[slug]/index.vue` for why the page, not this card, owns that call).
 */
import { computed } from 'vue'
import type { Component } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import type { RoundResponse } from '@/api/types'
import type { RoundStage } from '@/rounds/useRound'
import type { GameEntry } from '@/games/GameEntry'
import { gameComponents } from '@/games/registry'
import GameHeader from '@/ui/GameHeader.vue'
import RoundSurface from '@/ui/RoundSurface.vue'

const props = withDefaults(
  defineProps<{
    round: RoundResponse | null
    assetUrl: (key: number) => string
    /**
     * Where a game's own tile links land. Required like `assetUrl` above: only Weltanschauung's
     * game component reads it, but every caller supplies it regardless — an optional prop here is
     * exactly what let a caller forget it and ship a tile that throws the moment it is opened.
     */
    tipPath: (userId: string) => RouteLocationRaw
    /**
     * The round is over: the reveal face, no clock, no action, and handed on to the game itself —
     * a game without a round secret has nothing else to switch on. One prop with four effects at
     * one place — a second card would be a second place for „the same reveal UI“ to drift.
     */
    closed?: boolean
    /** Which face a running round calls for. A closed round has none. */
    stage?: RoundStage | undefined
    busy?: boolean
    notice?: string | null
    reveal?: (() => Promise<void>) | undefined
    submit?: ((guess: unknown) => Promise<void>) | undefined
    skip?: ((fromStage: number) => Promise<void>) | undefined
    giveUp?: (() => Promise<void>) | undefined
  }>(),
  {
    closed: false,
    busy: false,
    notice: null,
    stage: undefined,
    reveal: undefined,
    submit: undefined,
    skip: undefined,
    giveUp: undefined,
  },
)

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

/** A closed round is done by definition — there is no stage left to derive it from. */
const face = computed<RoundStage>(() => (props.closed ? 'done' : (props.stage ?? 'no-game')))
/** The band's clock, silenced for a closed round: its countdown would read 00:00:00 forever. */
const endsAt = computed<string | null>(() =>
  props.closed ? null : (props.round?.round?.end ?? null),
)
const disabled = computed(() => props.closed || props.busy || face.value === 'done')

async function onReveal(): Promise<void> {
  await props.reveal?.()
}

/**
 * `submit` never rejects — a failed or raced attempt lands in `notice` instead (see `useRound`'s
 * `run`) — so whether the guess actually went through is read off `notice` staying `null` after
 * the await, not off a resolved promise.
 */
async function onGuess(value: unknown): Promise<void> {
  if (props.submit === undefined) return
  await props.submit(value)
  if (props.notice === null) emit('guessed')
}

function onSkip(fromStage: number): void {
  void props.skip?.(fromStage)
}

function onGiveUp(): void {
  void props.giveUp?.()
}
</script>

<template>
  <!-- Anchored under its round number: the single-tip page's close control comes back here rather
       than to the top of the community page (see `rounds/[roundNumber]/tips/[userId].vue`). -->
  <!-- No id at all without a round number, rather than a shared 'round-0': two null cards on one
       page would otherwise collide. -->
  <div
    :id="round?.round?.number ? `round-${round.round.number}` : undefined"
    data-test="round-card"
  >
    <!-- Above the surface, not inside it: the notice is about the attempt that just failed, not
         about the round on the board, and inside the frame it would push the board down. -->
    <p v-if="notice" data-test="round-notice" class="mb-4 text-sm text-amber-700">{{ notice }}</p>

    <RoundSurface>
      <!-- The band belongs to the card, not to any one face: every face below is the same round of
           the same game for the same stretch of time, and a band per face would be four places for
           that to disagree. It also means each face says the game's name exactly zero times.
           A closed round loses the clock, not the band: which round and which game stays exactly
           where the running round puts it. -->
      <template #header>
        <GameHeader
          :round-number="round?.round?.number ?? null"
          :title="round?.game?.displayName ?? null"
          :ends-at="endsAt"
        />
      </template>

      <!-- Checked ahead of `stage`, not inside a `stage === 'sealed'` branch only: a sealed round
           for a game this build cannot render is just as unrenderable as a playing one — offering
           "Aufdecken" first and admitting the gap only afterwards would be the same lie one step
           later. -->
      <p v-if="component === null" data-test="round-unrenderable" class="text-sm text-neutral-600">
        In dieser Version gibt es dafür noch keine Ansicht.
      </p>

      <div
        v-else-if="face === 'sealed'"
        class="sealed-face flex flex-col items-center justify-center gap-4 text-center"
      >
        <!--
          Framework copy, not a game's: `sealed` exists only because a game answered
          `requiresReveal` with true, and that flag means the same thing for every game that ever
          sets it — the clock starts here, and there is no second attempt. The game's own component
          is not even mounted yet, so this is the only place the sentence can stand.
        -->
        <p data-test="round-reveal-cost" class="text-sm text-neutral-600">
          Deine Zeit läuft ab dem Aufdecken — und du hast nur <strong>einen</strong> Versuch.
        </p>
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

      <!--
        Keyed on the round's own number: a 409 on `submit`/`reveal` sends `useRound` back to
        `reload()`, which can land a *different* round in place (the day boundary passed underneath
        the click) without this `RoundCard` ever unmounting. Without the key the component instance
        would survive that change carrying the previous round's local state — a half-turned wheel
        angle, in Guess Hue's case — the same reasoning the lab applies keyed on `round.seed`.
      -->
      <component
        :is="component"
        v-else-if="face === 'playing' || face === 'done'"
        :key="round?.round?.number"
        :payload="round?.payload"
        :outcome="round?.me?.outcome ?? null"
        :my-guess="round?.me?.guess ?? null"
        :solution="round?.solution"
        :entries="entries"
        :mine-user-id="round?.me?.userId ?? null"
        :award-rule="round?.awardRule ?? null"
        :disabled="disabled"
        :stage="round?.me?.stage ?? 0"
        :asset-url="assetUrl"
        :closed="props.closed"
        :tip-path="props.tipPath"
        @guess="onGuess"
        @skip="onSkip"
        @give-up="onGiveUp"
      />
    </RoundSurface>
  </div>
</template>
