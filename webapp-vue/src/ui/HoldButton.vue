<script setup lang="ts">
/**
 * Hold to confirm. The gesture is the safeguard: nothing is submitted by a single press, and a
 * synthetic click without a real hold submits nothing at all.
 *
 * The keyboard gets the *same* gesture rather than a cheaper one — `keydown` starts the hold,
 * `keyup` abandons it. Letting Enter confirm outright would be exactly the accidental submission
 * the hold exists to prevent. Known limit: someone who cannot hold a key for the full duration
 * cannot confirm; lifting that needs a setting, and the setting is not this component's business.
 */
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useHoldProgress } from '@/ui/useHoldProgress'

/** The button's own timings. They stay here so `ui/` never has to reach into a game. */
const POP_MS = 400
const PULSE_MS = 200

const props = defineProps<{
  /** False while the wheel is still drawing itself: the button is neither seen nor reachable. */
  ready: boolean
  disabled: boolean
  label: string
  /** The colour the button shows — the hue currently under the wheel's knob. */
  color: string
  holdMs: number
}>()

const emit = defineEmits<{ confirm: [] }>()

const button = useTemplateRef<HTMLButtonElement>('button')
const keyHeld = ref(false)

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function inBackground(): boolean {
  return document.hidden
}

function canAnimate(el: Element | null): el is Element {
  // happy-dom has no Web Animations API, and neither has any point in animating an unseen tab.
  return !!el && typeof el.animate === 'function' && !prefersReducedMotion() && !inBackground()
}

const { progress, start, cancel } = useHoldProgress(props.holdMs, () => {
  if (canAnimate(button.value)) {
    button.value.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }],
      { duration: PULSE_MS, easing: 'ease-out' },
    )
  }
  emit('confirm')
})

/**
 * Absent, then a spring: too large, then under, then over, then under, settling. The amplitude
 * sequence is the whole effect, which is why it is written as keyframes and not as spring
 * parameters. It carries the one thing the screen otherwise never says — this is where you play.
 */
watch(
  () => props.ready,
  (ready) => {
    if (!ready || !canAnimate(button.value)) return
    button.value.animate(
      [
        { transform: 'scale(0)', opacity: 0, offset: 0 },
        { transform: 'scale(0.6)', opacity: 1, offset: 0.15 },
        { transform: 'scale(1.18)', offset: 0.22 },
        { transform: 'scale(0.94)', offset: 0.42 },
        { transform: 'scale(1.06)', offset: 0.62 },
        { transform: 'scale(0.98)', offset: 0.8 },
        { transform: 'scale(1)', offset: 1 },
      ],
      { duration: POP_MS, easing: 'ease-out' },
    )
  },
)

function beginHold(): void {
  if (props.disabled || !props.ready) return
  start()
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== ' ' && event.key !== 'Enter') return
  // Swallowed so the page does not scroll and the button's own click never fires.
  event.preventDefault()
  if (event.repeat || keyHeld.value) return
  keyHeld.value = true
  beginHold()
}

function onKeyUp(event: KeyboardEvent): void {
  if (event.key !== ' ' && event.key !== 'Enter') return
  keyHeld.value = false
  cancel()
}

const ringStyle = computed(() => ({
  background: `conic-gradient(currentColor ${progress.value * 360}deg, transparent 0deg)`,
  // Turns the disc into a ring; `closest-side` keeps it proportional at any wheel size.
  mask: 'radial-gradient(closest-side, transparent 84%, #000 85%)',
  WebkitMask: 'radial-gradient(closest-side, transparent 84%, #000 85%)',
  opacity: progress.value > 0 ? 1 : 0,
}))
</script>

<template>
  <div class="relative size-full">
    <span
      data-test="hold-ring"
      aria-hidden="true"
      class="pointer-events-none absolute -inset-[12%] rounded-full text-neutral-900"
      :style="ringStyle"
    />
    <!--
      `|| undefined` is not decoration: Vue keeps `inert="false"` in the DOM for a plain false,
      and it would still be in effect. See frontend-ui.md.
    -->
    <button
      ref="button"
      data-test="hold-button"
      type="button"
      :inert="!props.ready || undefined"
      :aria-label="props.label"
      :disabled="props.disabled"
      :style="{ backgroundColor: props.color }"
      class="absolute inset-0 cursor-pointer rounded-full shadow-inner ring-1 ring-black/10 disabled:cursor-not-allowed"
      @pointerdown="beginHold"
      @pointerup="cancel"
      @pointercancel="cancel"
      @pointerleave="cancel"
      @keydown="onKeyDown"
      @keyup="onKeyUp"
    />
  </div>
</template>
