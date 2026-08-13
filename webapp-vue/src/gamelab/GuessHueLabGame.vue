<script setup lang="ts">
/**
 * Guess Hue in the lab: which card the round is on, and the two things only the lab needs — the
 * guess wrapped into the shape the endpoint takes, and the server's `unknown`s narrowed to numbers.
 *
 * The switch lives here rather than in the board because this is the place that turns `unknown`
 * into typed values. `myGuess` stays beside `entries` even though it is derivable from it: it has
 * its own documented job — the wheel's starting angle after a reload.
 */
import { computed, ref, watch } from 'vue'
import GuessHueBoard from '@/games/guesshue/GuessHueBoard.vue'
import GuessHueReveal from '@/games/guesshue/GuessHueReveal.vue'
import type { RevealGuess } from '@/games/guesshue/reveal'
import type { GuessHuePayload, GuessHueSolution, LabEntryDto } from './types'

const props = defineProps<{
  payload: GuessHuePayload
  outcome: unknown
  disabled: boolean
  /** The viewer's own stored guess, in whatever shape the game recorded it. */
  myGuess: unknown
  /** What the server revealed once the viewer had spent their guess, or `null`. */
  solution: unknown
  /** The visible entries, in the order the lab page already builds — mine first. */
  entries: LabEntryDto[]
  /** Which of them is mine. Never the position: that is a display decision. */
  mineUserId: string | null
}>()

const emit = defineEmits<{ guess: [value: unknown] }>()

/** Narrowed rather than cast: `unknown` by contract, and a stale round may be junk. */
function hueOf(guess: unknown): number | null {
  if (typeof guess !== 'object' || guess === null) return null
  const hue = (guess as { hue?: unknown }).hue
  return typeof hue === 'number' && Number.isFinite(hue) ? hue : null
}

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

/** An entry the wheel cannot place drops out of the list rather than being drawn wrong. */
const guesses = computed<RevealGuess[]>(() =>
  props.entries.flatMap((entry) => {
    const hue = hueOf(entry.guess)
    return hue === null ? [] : [{ userId: entry.userId, hue, colorHex: entry.avatar.bgColorHex }]
  }),
)

/**
 * Whether the reveal that is about to show is something that just *happened* here, rather than
 * something that was already true when this instance mounted. Flips true only on a live
 * null→non-null transition of the narrowed `solution` — never on the initial value, because a
 * `watch` without `immediate: true` does not fire for it. That is what makes an instance that
 * mounts already-revealed start `false` and stay there: a reload must not replay the choreography.
 *
 * A setup-time constant cannot do this correctly: the lab page keys the game component on
 * `round.seed`, not on whether a guess exists, so the same instance can cross the revealed
 * boundary more than once — reload into a spent round, delete the guess (`solution` back to
 * `null`), guess again (`solution` non-null again) — and the second live transition must re-arm
 * the beats just as the first would have.
 *
 * The default `pre` flush matters here: it runs this callback before the component re-renders, so
 * the flag is already `true` by the time `GuessHueReveal` mounts and reads `animate` — that
 * ordering is what lets the first beat happen at all. A later change to `flush` would silently
 * break it.
 */
const hasRevealedLive = ref(false)
watch(solution, (now, before) => {
  if (before === null && now !== null) hasRevealedLive.value = true
})
const animate = computed(() => hasRevealedLive.value)
</script>

<template>
  <!--
    One grid cell for both cards, rather than one absolutely positioned over the other: this way
    the surroundings are as tall as whichever card is taller during the crossfade, and fall to the
    reveal card's height by themselves once the outgoing one is gone.
  -->
  <div class="grid">
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
        :description="props.payload.description"
        :saturation="props.payload.saturation"
        :lightness="props.payload.lightness"
        :target-hue="solution.targetHue"
        :tolerance-deg="solution.toleranceDeg ?? 0"
        :guesses="guesses"
        :mine-user-id="props.mineUserId"
        :animate="animate"
      />
      <GuessHueBoard
        v-else
        class="[grid-area:1/1]"
        :description="props.payload.description"
        :init-hue="myHue ?? props.payload.initHue"
        :saturation="props.payload.saturation"
        :lightness="props.payload.lightness"
        :tolerance-deg="props.payload.toleranceDeg"
        :disabled="props.disabled"
        @guess="(hue: number) => emit('guess', { hue })"
      />
    </Transition>
  </div>
</template>
