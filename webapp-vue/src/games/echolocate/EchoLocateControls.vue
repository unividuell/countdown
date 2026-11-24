<script setup lang="ts">
/**
 * Everything under the field: what a click does, the pin hint, and the hand-in row.
 *
 *   1. Klick: Ping, 2. Klick: Markieren
 *   Lang drücken: Pin setzen oder entfernen
 *   ┃🔉     ( Abgeben )  (🧹)      volume left, broom right, „Abgeben“ centred
 *
 * One component for the board and the sealed card, so phase two keeps its layout through START.
 */
import IconBroom from '~icons/lucide/brush-cleaning'
import HoldButton from '@/ui/HoldButton.vue'
import { readableTextColor } from '@/ui/readableTextColor'
import SoundOffNotice from '@/ui/SoundOffNotice.vue'
import VolumeControl from '@/ui/VolumeControl.vue'
import { PINS_FULL } from './flow'
import { useVolumePreview } from './useVolumePreview'

const props = defineProps<{
  status: string
  pinHint: string
  canHandIn: boolean
  hasRings: boolean
  touching: boolean
  colorHex: string
}>()

const emit = defineEmits<{ handIn: []; progress: [p: number]; clearRings: [] }>()

const { onPress, onAdjust, onRelease } = useVolumePreview()
</script>

<template>
  <div class="text-center">
    <p data-test="echo-locate-status" aria-live="polite" class="text-lg">{{ props.status }}</p>
    <p
      data-test="echo-locate-pin-hint"
      aria-live="polite"
      class="text-sm"
      :class="
        props.pinHint === PINS_FULL ? 'font-semibold text-on-surface' : 'text-on-surface-variant'
      "
    >
      {{ props.pinHint }}
    </p>
  </div>

  <!-- As Anspielung's play row: „Abgeben“ stays centred, the volume left and the broom right of it.
       The side tracks are `minmax(0,1fr)`, so neither can shift the middle. -->
  <div
    data-test="echo-locate-hand-in-row"
    class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center self-stretch"
  >
    <span class="flex w-full min-w-0 justify-start self-stretch pr-4">
      <VolumeControl class="h-full" @press="onPress" @adjust="onAdjust" @release="onRelease" />
    </span>
    <!-- `HoldButton` fills its parent and has no size of its own. -->
    <div class="relative size-24 shrink-0" :class="{ 'opacity-40': !props.canHandIn }">
      <HoldButton
        :ready="true"
        :disabled="!props.canHandIn || props.touching"
        label="Schätzung abgeben — gedrückt halten"
        :color="props.colorHex"
        @confirm="emit('handIn')"
        @progress="emit('progress', $event)"
      />
      <span
        data-test="echo-locate-submit-label"
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold"
        :style="{ color: readableTextColor(props.colorHex) }"
      >
        Abgeben
      </span>
    </div>
    <!-- Tidies up only, so it stays small and wordless; the label names it for screen readers. -->
    <span class="min-w-0 justify-self-start pl-4">
      <button
        type="button"
        data-test="echo-locate-clear-rings"
        aria-label="Markierungen löschen"
        title="Markierungen löschen"
        :disabled="!props.hasRings"
        class="flex size-11 cursor-pointer items-center justify-center rounded-full border-2 border-outline text-xl text-on-surface-variant disabled:cursor-not-allowed disabled:opacity-40"
        @click="emit('clearRings')"
      >
        <IconBroom class="size-5" aria-hidden="true" />
      </button>
    </span>
  </div>
  <SoundOffNotice reserve />
</template>
