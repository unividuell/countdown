<script setup lang="ts">
/**
 * „Zentrieren“: zooming at the pointer can walk the view off the field; this brings it back to the
 * centre, the angle kept. Board and reveal both carry it.
 */
import IconCentre from '~icons/lucide/locate-fixed'
import { TOOL_BUTTON } from './toolButton'
import { centred, isCentred } from './view'
import type { Camera } from './view'

const camera = defineModel<Camera>('camera', { required: true })
</script>

<template>
  <button
    type="button"
    aria-label="Zentrieren"
    :class="TOOL_BUTTON"
    :disabled="isCentred(camera)"
    @click="camera = centred(camera)"
  >
    <IconCentre class="size-5" aria-hidden="true" />
  </button>
</template>
