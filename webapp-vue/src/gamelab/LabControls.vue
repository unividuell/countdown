<script setup lang="ts">
/**
 * The lab's controls, under the game card. Below rather than above, so the card sits where a real
 * round's does and its look is reviewed undisturbed.
 */
import { computed, ref, watch } from 'vue'
import LabOptions from './LabOptions.vue'
import { parseSeed } from './seed'
import { switchPlayerHref } from './switchPlayer'
import type { LabAwardRule, LabPhase } from './types'

const props = defineProps<{
  /** URL-bound — the buttons must reflect a click immediately, before any response comes back. */
  seed: number
  phase: LabPhase
  returnPath: string
  busy: boolean
  /**
   * Round-bound, not URL-bound — these three always come from the same `LabRoundResponse`, so the
   * rule line describes a round that actually existed rather than a click paired with whatever
   * round happened to be loaded before it. Absent while no round has loaded yet, and briefly stale
   * (the *previous* round's snapshot) while a new one is in flight — never a mix of one round's
   * phase with another's rule, which is the failure mode `phase` above would produce here.
   */
  roundPhase?: LabPhase | undefined
  awardRule?: LabAwardRule | undefined
  awardPoints?: number | undefined
  /** Round-bound like the rule above: the loaded round's, not one worked out from the seed here. */
  difficulty?: number | undefined
  /** URL-bound like `phase`: the switch must reflect a click before any response comes back. */
  ramp: boolean
}>()
const emit = defineEmits<{
  apply: [seed: number]
  roll: []
  phaseChange: [phase: LabPhase]
  rampChange: [on: boolean]
  reset: []
  forgetMine: []
  refresh: []
}>()

const draft = ref(String(props.seed))
watch(
  () => props.seed,
  (next) => (draft.value = String(next)),
)

/** Null means the field does not hold a usable seed; saying so beats silently doing nothing. */
const invalid = ref(false)

function apply(): void {
  const parsed = parseSeed(draft.value)
  invalid.value = parsed === null
  if (parsed !== null) emit('apply', parsed)
}

const ACTION =
  'flex h-11 cursor-pointer items-center gap-2 rounded-md border border-outline px-3 text-sm hover:bg-surface-container disabled:cursor-default disabled:opacity-40'

const KEYCAP = 'rounded border border-outline px-1 py-0.5 font-sans text-[10px] text-on-surface/40'

const DIFFICULTY_FORMAT = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/**
 * The rule sits here, right under the switch that changes it, rather than by the page heading:
 * this is the control a reviewer's eye is already on when they flip phase, so the rule that just
 * took effect is the one thing they need next to it.
 *
 * Built entirely from `roundPhase`/`awardRule`/`awardPoints` — never from `phase` — because those
 * three are one snapshot from one response, while `phase` updates the instant a button is clicked
 * and can outrun the round it describes. Reading `phase` here would pair a phase that is already
 * true with a rule that is not yet — self-correcting on the happy path, but stuck wrong forever if
 * the request that was meant to catch it up fails.
 */
const ruleText = computed(() => {
  if (
    props.roundPhase === undefined ||
    props.awardRule === undefined ||
    props.awardPoints === undefined
  ) {
    return null
  }
  const label = props.roundPhase === 'TWO' ? 'Phase 2' : 'Phase 1'
  return props.awardRule === 'CLOSEST_ONLY'
    ? `${label} · nur der Beste, ${props.awardPoints} Punkte`
    : `${label} · jeder Treffer ${props.awardPoints} Punkt`
})
</script>

<template>
  <div class="space-y-2">
    <h2
      data-test="lab-heading"
      class="text-xs font-semibold tracking-wide text-on-surface/40 uppercase"
    >
      Spiel-Labor
    </h2>

    <form class="flex items-center gap-2" @submit.prevent="apply">
      <label class="sr-only" for="lab-seed">Seed</label>
      <input
        id="lab-seed"
        v-model="draft"
        data-test="lab-seed"
        inputmode="numeric"
        :aria-invalid="invalid || undefined"
        class="h-11 w-full min-w-0 rounded-md border px-2 font-mono text-sm"
        :class="invalid ? 'border-error' : 'border-outline'"
        @input="invalid = false"
      />
      <button type="submit" class="h-11 shrink-0 cursor-pointer rounded-md border px-2 text-sm">
        Setzen
      </button>
      <button
        type="button"
        data-test="lab-roll"
        title="R"
        aria-keyshortcuts="R"
        class="flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-md border px-2 text-sm"
        @click="emit('roll')"
      >
        Würfeln
        <kbd aria-hidden="true" :class="KEYCAP">R</kbd>
      </button>
    </form>
    <p v-if="invalid" data-test="lab-seed-invalid" class="text-xs text-error">
      Kein gültiger Seed — eine ganze Zahl von −2147483648 bis 2147483647.
    </p>
    <p
      v-if="props.difficulty !== undefined"
      data-test="lab-difficulty"
      class="text-xs text-on-surface-variant"
    >
      Schwierigkeit {{ DIFFICULTY_FORMAT.format(props.difficulty) }}
    </p>

    <LabOptions
      :phase="props.phase"
      :ramp="props.ramp"
      :busy="props.busy"
      @phase-change="emit('phaseChange', $event)"
      @ramp-change="emit('rampChange', $event)"
    />
    <p v-if="ruleText" data-test="lab-award-rule" class="text-xs text-on-surface-variant">
      {{ ruleText }}
    </p>

    <!-- Wraps rather than scrolls: on a phone the four actions take two lines. -->
    <div class="flex flex-wrap gap-2 pt-2">
      <button
        type="button"
        data-test="lab-refresh"
        :disabled="props.busy"
        :class="ACTION"
        @click="emit('refresh')"
      >
        Aktualisieren
      </button>
      <button
        type="button"
        data-test="lab-reset"
        :disabled="props.busy"
        :class="ACTION"
        @click="emit('reset')"
      >
        Runde zurücksetzen
        <kbd aria-hidden="true" :class="KEYCAP">X</kbd>
      </button>
      <button
        type="button"
        data-test="lab-forget-mine"
        :disabled="props.busy"
        :class="ACTION"
        @click="emit('forgetMine')"
      >
        Meinen Guess löschen
        <kbd aria-hidden="true" :class="KEYCAP">Z</kbd>
      </button>
      <!-- Full page load, not router navigation: the picker is server-rendered HTML, and the
           redirect brings us back to this exact seed so a player switch does not cost the round. -->
      <a data-test="lab-switch-player" :href="switchPlayerHref(props.returnPath)" :class="ACTION">
        Spieler wechseln
        <kbd aria-hidden="true" :class="KEYCAP">W</kbd>
      </a>
    </div>
  </div>
</template>
