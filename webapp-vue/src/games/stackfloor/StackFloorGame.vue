<script setup lang="ts">
/**
 * Hochstapler: which card the round is on, and the one place `unknown` becomes typed.
 *
 * `skip` and `giveUp` are declared but never emitted — one stage, one attempt, and both exits are
 * the framework's. `solution` is declared and never read: the tower is rebuilt from the click times.
 * `scene` is read only while sealed: with the payload open, its geometry is the board's.
 */
import { computed } from 'vue'
import type { GameEmits, GameProps } from '@/games/GameProps'
import { useRevealedLive } from '@/games/useRevealedLive'
import { scoreRows } from './scoreboard'
import StackFloorBoard from './StackFloorBoard.vue'
import StackFloorReveal from './StackFloorReveal.vue'
import { asStackFloorGuess, asStackFloorPayload, asStackFloorScene } from './types'

const props = defineProps<GameProps>()

const emit = defineEmits<GameEmits>()

const payload = computed(() => asStackFloorPayload(props.payload))
const scene = computed(() => (props.sealed === true ? asStackFloorScene(props.scene) : null))
const myGuess = computed(() => asStackFloorGuess(props.myGuess))
const done = computed(() => props.closed === true || myGuess.value !== null)

const rows = computed(() =>
  scoreRows({
    entries: props.entries,
    awardRule: props.awardRule,
    mineUserId: props.mineUserId,
  }),
)

const live = computed(() => props.awardRule === 'CLOSEST_ONLY')

const hasRevealedLive = useRevealedLive(done)
</script>

<template>
  <p v-if="!props.sealed && payload === null" class="text-sm text-on-surface-variant">
    Diese Runde lässt sich hier nicht anzeigen.
  </p>
  <StackFloorReveal
    v-else-if="done && payload"
    :payload="payload"
    :rows="rows"
    :mine-user-id="props.mineUserId"
    :live="live"
    :animate="hasRevealedLive"
  />
  <StackFloorBoard
    v-else
    :payload="payload"
    :scene="scene"
    :sealed="props.sealed === true"
    :disabled="props.disabled"
    :submitted="myGuess !== null"
    :award-rule="props.awardRule"
    :award-points="props.awardPoints"
    @guess="(value) => emit('guess', value)"
    @reveal="emit('reveal')"
  />
</template>
