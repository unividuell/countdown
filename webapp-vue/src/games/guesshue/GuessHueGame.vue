<script setup lang="ts">
/**
 * Guess Hue: which card the round is on. Narrows the payload and the solution — both `unknown` by
 * contract — into the numbers the board and the reveal need, shows the input wheel until the
 * viewer's guess is spent, then switches to the reading wheel, and plays the reveal choreography
 * only when that switch just happened for real rather than on a reload into an already-spent round.
 *
 * The switch lives here rather than in the board because this is the place that turns `unknown`
 * into typed values. `myGuess` stays beside `entries` even though it is derivable from it: it has
 * its own documented job — the wheel's starting angle after a reload.
 */
import { computed } from 'vue'
import GuessHueBoard from './GuessHueBoard.vue'
import GuessHueReveal from './GuessHueReveal.vue'
import type { RevealGuess } from './reveal'
import { scoreboardRows, solutionCell } from './scoreboard'
import type { ScoreboardRow } from './scoreboard'
import type { GameEmits, GameProps } from '@/games/GameProps'
import { TIP_COLUMN, cellDelayMs } from '@/games/revealChoreography'
import { useRevealedLive } from '@/games/useRevealedLive'
import { asGuessHuePayload, hueOf } from './types'
import type { GuessHueSolution } from './types'

const props = defineProps<GameProps>()

const emit = defineEmits<GameEmits>()

const payload = computed(() => asGuessHuePayload(props.payload))

const myHue = computed(() => hueOf(props.myGuess))

/**
 * A finite target paired with either a finite tolerance or `null` (phase two — no gate, so no
 * arc) — or nothing at all. Junk here leaves the input card standing, which is the honest outcome
 * — the alternative is `NaN` in a transformation matrix. A *missing* or non-numeric tolerance is
 * still a broken payload and still disqualifies the whole solution; only `null` is meaningful.
 */
const solution = computed<GuessHueSolution | null>(() => {
  const raw = props.solution
  if (typeof raw !== 'object' || raw === null) return null
  const { targetHue, toleranceDeg } = raw as { targetHue?: unknown; toleranceDeg?: unknown }
  if (typeof targetHue !== 'number' || !Number.isFinite(targetHue)) return null
  if (toleranceDeg === null) return { targetHue, toleranceDeg: null }
  if (typeof toleranceDeg !== 'number' || !Number.isFinite(toleranceDeg)) return null
  return { targetHue, toleranceDeg }
})

/** Empty until the server has revealed: without a solution there is nothing to rank against. */
const rows = computed<ScoreboardRow[]>(() =>
  solution.value === null || payload.value === null
    ? []
    : scoreboardRows({
        entries: props.entries,
        saturation: payload.value.saturation,
        lightness: payload.value.lightness,
        awardRule: props.awardRule,
        mineUserId: props.mineUserId,
      }),
)

/**
 * The head block's solution cell. The `?? 0`s are never reached in practice — the reveal card only
 * exists once `payload` and `solution` are non-null — and exist so this stays a plain computed
 * rather than a nullable prop threaded through two components.
 */
const solutionCellValue = computed(() =>
  solutionCell(
    solution.value?.targetHue ?? 0,
    payload.value?.saturation ?? 0,
    payload.value?.lightness ?? 0,
  ),
)

/**
 * An entry the wheel cannot place drops out of the list rather than being drawn wrong. One the
 * *table* cannot rank stays — a guess is not worth removing from the picture because its verdict
 * is junk — and joins the cascade after every row.
 */
const guesses = computed<RevealGuess[]>(() => {
  const tickByUser = new Map(rows.value.map((row) => [row.userId, row.tick]))
  const rowCount = rows.value.length
  let extra = 0
  return props.entries.flatMap((entry) => {
    const hue = hueOf(entry.guess)
    if (hue === null) return []
    const tick = tickByUser.get(entry.userId) ?? rowCount + extra++
    return [
      {
        userId: entry.userId,
        hue,
        colorHex: entry.avatar.bgColorHex,
        revealDelayMs: cellDelayMs(tick, TIP_COLUMN, rowCount),
      },
    ]
  })
})

/** „Live“ is the round's rule, not a per-row question — the rows carry their own `provisional`. */
const live = computed(() => props.awardRule === 'CLOSEST_ONLY')

const animate = useRevealedLive(() => solution.value !== null)
</script>

<template>
  <!--
    One grid cell for both cards, rather than one absolutely positioned over the other: this way
    the surroundings are as tall as whichever card is taller during the crossfade, and fall to the
    reveal card's height by themselves once the outgoing one is gone.
  -->
  <div v-if="payload" class="grid">
    <!--
      Beat 2. No `mode`, so both cards overlap: my marker sits on the same radius and the same
      angle as the knob by construction, which is what makes the crossfade read as one circle
      changing colour. No `appear`, so a reload does not replay any of it.
    -->
    <Transition
      enter-active-class="transition-opacity duration-500 delay-200 motion-reduce:transition-none"
      enter-from-class="opacity-0"
      leave-active-class="hue-card-leaving transition-opacity duration-300 motion-reduce:transition-none"
      leave-to-class="opacity-0"
    >
      <GuessHueReveal
        v-if="solution"
        class="[grid-area:1/1]"
        :description="payload.description"
        :saturation="payload.saturation"
        :lightness="payload.lightness"
        :target-hue="solution.targetHue"
        :tolerance-deg="solution.toleranceDeg ?? 0"
        :guesses="guesses"
        :mine-user-id="props.mineUserId"
        :animate="animate"
        :rows="rows"
        :solution-cell="solutionCellValue"
        :live="live"
      />
      <GuessHueBoard
        v-else
        class="[grid-area:1/1]"
        :description="payload.description"
        :init-hue="myHue ?? payload.initHue"
        :saturation="payload.saturation"
        :lightness="payload.lightness"
        :disabled="props.disabled"
        :award-rule="props.awardRule"
        :award-points="props.awardPoints"
        @guess="(hue: number) => emit('guess', { hue })"
      />
    </Transition>
  </div>
  <p v-else class="text-sm text-neutral-600">Diese Runde lässt sich hier nicht anzeigen.</p>
</template>
