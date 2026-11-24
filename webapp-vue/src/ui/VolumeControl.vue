<script setup lang="ts">
/**
 * Volume beside a game's transport: a vertical slider whose knob is the speaker — that is what
 * tells it apart from any other control. Mute stays in the header. The caller gives the height:
 * the transport row's, all of it.
 *
 * Its ratchet knocks, so like a sparking hold it puts its page on stage: a tap there wakes the
 * graph. Silent, it knocks nothing and leaves that to its game.
 */
import { useSoundStage } from './useSoundAwake'
import VolumeSlider from './VolumeSlider.vue'

/** `silent`: the game lets the level be heard its own way (Peilung's bed), not by the ratchet. */
const props = defineProps<{ silent?: boolean }>()

const emit = defineEmits<{ adjust: []; press: []; release: [] }>()

if (!props.silent) useSoundStage()
</script>

<template>
  <VolumeSlider
    vertical
    :silent="props.silent"
    data-test="volume-control"
    class="w-11 shrink-0"
    @adjust="emit('adjust')"
    @press="emit('press')"
    @release="emit('release')"
  />
</template>
