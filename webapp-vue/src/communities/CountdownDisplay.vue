<script setup lang="ts">
import { computed, ref, toRef, useId } from 'vue'
import { useCountdown } from '@/communities/useCountdown'
import FlipDotBoard from '@/ui/flipdot/FlipDotBoard.vue'
import FlipDotLegend from '@/ui/flipdot/FlipDotLegend.vue'

const props = defineProps<{ slug: string | null | undefined }>()
const { view, cycleBaseUnit } = useCountdown(toRef(props, 'slug'))

const UNIT_LABELS: Record<string, string> = {
  M: 'MON',
  w: 'WO',
  d: 'TAGE',
  h: 'STD',
  m: 'MIN',
  s: 'SEK',
}

const UNIT_NAMES: Record<string, [string, string]> = {
  M: ['Monat', 'Monate'],
  w: ['Woche', 'Wochen'],
  d: ['Tag', 'Tage'],
  h: ['Stunde', 'Stunden'],
  m: ['Minute', 'Minuten'],
  s: ['Sekunde', 'Sekunden'],
}

// Only the leading group is padded. Two digits keep the board's width stable across a day
// boundary, which is worth having because a width change costs a full relight. Padding the inner
// groups of the months state as well would push the board past the width the header has.
const text = computed(() =>
  view.value.chips.map((chip, i) => (i === 0 ? chip.value.padStart(2, '0') : chip.value)).join(':'),
)

const labels = computed(() => view.value.chips.map((chip) => UNIT_LABELS[chip.unit] ?? ''))

// A dot matrix reads as nothing to a screen reader, and the legend is aria-hidden — so this is the
// only place the value is spoken. It carries what the dropped T-/T+ prefix used to say.
const reading = computed(() => {
  const parts = view.value.chips.map((chip) => {
    const value = Number(chip.value)
    const names = UNIT_NAMES[chip.unit]
    return names === undefined ? chip.value : `${value} ${value === 1 ? names[0] : names[1]}`
  })
  return view.value.state === 'after'
    ? `Laufzeit ${parts.join(', ')}`
    : `Noch ${parts.join(', ')} bis zum Start`
})

const legendVisible = ref(false)

// A hidden span carries the action hint via aria-describedby, kept separate from aria-label so the
// value (the wrapper's accessible name, below) isn't buried behind it.
const hintId = useId()
</script>

<template>
  <button
    v-if="view.state !== 'idle'"
    data-test="countdown"
    type="button"
    class="w-fit max-w-full cursor-pointer select-none"
    :title="view.state === 'after' ? undefined : 'Countdown bis zum Start'"
    :aria-label="reading"
    :aria-describedby="hintId"
    @click="cycleBaseUnit"
  >
    <!-- A real button, not a div wearing role="button": click, Enter, Space, focus order and Space's
         scroll-prevention all come from the browser then, identically in every engine. The
         hand-rolled version worked in Chromium and was reported dead in Firefox, and rather than
         guess at the difference we stopped hand-rolling. cursor-pointer is explicit because
         Tailwind v4's preflight gives buttons no pointer, and without one nothing marks the board
         as a control at all — which is how it came to be reported as unclickable.
         Height-driven, so the dot size is the same in every state and at every viewport width; the
         viewBox ratio supplies the width. max-w-full is the net for anything below 360px, where
         preserveAspectRatio then scales the dots down inside the reserved height instead of
         letting the board push the header apart — it resolves against the wrapper's w-fit width,
         which is why the wrapper states fit-content rather than leaving it to shrink-to-fit.
         The legend inherits that same width, so it needs no width of its own. -->
    <FlipDotBoard
      data-test="countdown-board"
      class="h-[26px] w-auto max-w-full"
      aria-hidden="true"
      :text="text"
      :label="reading"
      @phase="legendVisible = $event === 'live'"
    />
    <!-- aria-hidden above: name-from-content doesn't pull a child img's aria-label up into this
         button's accessible name (verified in Chromium), so the button carries the reading itself
         via aria-label and the board becomes decoration here. label is still passed — it's part of
         the component's contract and documents what the board depicts — but it goes unannounced in
         this consumer. In the card, nothing wraps the board, so it stays self-describing there. -->
    <FlipDotLegend class="mt-0.5" :text="text" :labels="labels" :visible="legendVisible" />
    <span :id="hintId" class="sr-only">Drücken, um die Zeiteinheit umzuschalten</span>
  </button>
</template>
