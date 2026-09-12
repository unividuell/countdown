<script setup lang="ts">
/**
 * One board: the round. A text paints a colour in words, the wheel is turned until it matches, the
 * button in its centre is held to confirm.
 *
 * It knows nothing about "my guess" and nothing about the lab — it is handed a starting angle and
 * whether it is locked, and it hands back an angle. That is what lets the real game page reuse it
 * without dragging any wheel or hold logic along.
 */
import { computed, ref, watch } from 'vue'
import type { AwardRule } from '@/api/types'
import AwardBox from '@/ui/AwardBox.vue'
import HoldButton from '@/ui/HoldButton.vue'
import InfoBox from '@/ui/InfoBox.vue'
import HueRules from './HueRules.vue'
import HueWheelInput from './HueWheelInput.vue'

const props = defineProps<{
  description: string
  initHue: number
  saturation: number
  lightness: number
  disabled: boolean
  awardRule: AwardRule | null
  awardPoints: number | null
}>()

const emit = defineEmits<{ guess: [hue: number] }>()

const hue = ref(props.initHue)
// A reload hands down a new starting angle — the lab feeds back the angle already guessed.
watch(
  () => props.initHue,
  (next) => {
    hue.value = next
  },
)

/** False until the ring has finished drawing itself; the confirm button stays away until then. */
const ready = ref(false)

const color = computed(
  () => `hsl(${hue.value} ${props.saturation * 100}% ${props.lightness * 100}%)`,
)

// `group` exists for one descendant: the centre button reacts to the leave class the reveal
// transition puts on this element (`hue-card-leaving`). The frame around all this belongs to
// whoever mounts the game — see `ui/RoundSurface.vue`.
</script>

<template>
  <div class="group">
    <!--
      A rule, not a box: a bordered card inside a bordered card reads as clutter. `select-none`
      is not cosmetic — without it a thumb resting beside the wheel selects the text and raises
      the iOS callout.
    -->
    <blockquote class="border-l-4 border-neutral-300 py-1 pl-4">
      <p
        data-test="hue-description"
        class="text-xl leading-relaxed font-medium text-neutral-900 italic select-none"
      >
        „{{ props.description }}“
      </p>
    </blockquote>

    <div class="mt-6">
      <HueWheelInput
        v-model:hue="hue"
        :saturation="props.saturation"
        :lightness="props.lightness"
        :disabled="props.disabled"
        @boot-done="ready = true"
      >
        <template #center>
          <!-- Beat 1 of the reveal: the button leaves before the card behind it does. -->
          <div
            class="size-full transition duration-200 ease-in group-[.hue-card-leaving]:scale-50 group-[.hue-card-leaving]:opacity-0 motion-reduce:transition-none"
          >
            <HoldButton
              :ready="ready"
              :disabled="props.disabled"
              :color="color"
              label="Tipp bestätigen — gedrückt halten"
              @confirm="emit('guess', hue)"
            />
          </div>
        </template>
      </HueWheelInput>
    </div>

    <div class="mt-8 flex flex-col gap-3">
      <InfoBox storage-key="guess-hue">
        <template #abstract>Triff den beschriebenen Farbton.</template>
        <HueRules />
      </InfoBox>
      <AwardBox
        v-if="props.awardRule !== null && props.awardPoints !== null"
        :award-rule="props.awardRule"
        :award-points="props.awardPoints"
        game-id="guess-hue"
      >
        <template #qualifies
          >Dein Farbton muss nah genug am gesuchten liegen (innerhalb der Toleranz).</template
        >
        <template #closest>Bester Tipp: am nächsten am gesuchten Farbton.</template>
      </AwardBox>
    </div>
  </div>
</template>
