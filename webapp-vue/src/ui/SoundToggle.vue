<script setup lang="ts">
import { computed } from 'vue'
import IconAsleep from '~icons/lucide/volume'
import IconVolume from '~icons/lucide/volume-2'
import IconMuted from '~icons/lucide/volume-x'
import { useGameSound } from './useGameSound'
import { useSoundAwake } from './useSoundAwake'
import { unlockSound } from './woodKnock'

const sound = useGameSound()
const awake = useSoundAwake()

/** `asleep`: sound is on, but the browser has not let the graph start yet. */
const state = computed(() => (!sound.value ? 'off' : awake.value ? 'on' : 'asleep'))

/**
 * Read when the press begins: the press itself wakes the graph, which may run by the time the
 * click arrives.
 */
let pressedAsleep = false

function onPress(): void {
  pressedAsleep = state.value === 'asleep'
}

/** A press on the sleeping toggle asks for sound: it wakes, it does not mute. */
function onClick(): void {
  if (!pressedAsleep) sound.value = !sound.value
  pressedAsleep = false

  if (sound.value) unlockSound()
}
</script>

<template>
  <button
    type="button"
    aria-label="Ton"
    :aria-pressed="sound"
    :data-state="state"
    @pointerdown="onPress"
    @keydown.enter="onPress"
    @keydown.space="onPress"
    @click="onClick"
  >
    <IconVolume v-if="state === 'on'" class="size-5" aria-hidden="true" />
    <IconAsleep v-else-if="state === 'asleep'" class="size-5" aria-hidden="true" />
    <IconMuted v-else class="size-5" aria-hidden="true" />
  </button>
</template>
