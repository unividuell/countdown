<script setup lang="ts">
/**
 * Where the sound is the point, a muted device says so: the switch in the header is easy to miss.
 * `reserve` keeps the line's room while it is hidden, so muting moves nothing below it.
 */
import { useGameVolume } from './useGameVolume'

const props = defineProps<{ reserve?: boolean }>()

const volume = useGameVolume()
</script>

<template>
  <p
    v-if="volume === 0 || props.reserve"
    data-test="sound-off"
    class="text-sm font-semibold text-warning"
    :class="{ invisible: volume !== 0 }"
    :aria-hidden="volume !== 0 || undefined"
  >
    Ton ist aus
  </p>
</template>
