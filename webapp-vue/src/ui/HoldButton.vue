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
import { inBackground, prefersReducedMotion } from '@/ui/motion'
import { BEAT_MS, DEFAULT_HOLD_MS, useHoldProgress } from '@/ui/useHoldProgress'

/** The button's own timings. They stay here so `ui/` never has to reach into a game. */
const POP_MS = 400
const PULSE_MS = 200

const props = withDefaults(
  defineProps<{
    /** False while the wheel is still drawing itself: the button is neither seen nor reachable. */
    ready: boolean
    disabled: boolean
    label: string
    /**
     * The colour the button shows — the hue currently under the wheel's knob. Without one the
     * button paints nothing of its own, for something lying on it: Platzierung's patch, whose
     * true edge a coloured square would give away.
     */
    color?: string
    /** Per-caller override; a caller with no opinion gets [DEFAULT_HOLD_MS]. */
    holdMs?: number
    /**
     * Turns the hold into a count-in of this many beats: the button reads [label] at rest and
     * the beat while held, and the hold lasts `beats × beatMs` — [holdMs] is ignored then.
     */
    beats?: number
    /** One beat of the count-in. Entstauber counts in at its round's tempo. */
    beatMs?: number
    /** `square` when something square lies on the button — Platzierung's patch — and must not be cut. */
    shape?: 'round' | 'square'
  }>(),
  { holdMs: DEFAULT_HOLD_MS, beatMs: BEAT_MS, shape: 'round' },
)

const emit = defineEmits<{ confirm: [] }>()

const button = useTemplateRef<HTMLButtonElement>('button')
/** The outline and the button arrive as one object — this is what the entrance animates. */
const pop = useTemplateRef<HTMLDivElement>('pop')
const keyHeld = ref(false)

function canAnimate(el: Element | null): el is Element {
  // happy-dom has no Web Animations API, and neither has any point in animating an unseen tab.
  return !!el && typeof el.animate === 'function' && !prefersReducedMotion() && !inBackground()
}

/** With `beats`, the hold is a count-in: it always restarts at [beats], never resumes a rewind. */
const counting = props.beats !== undefined
const { progress, holding, start, cancel } = useHoldProgress(
  counting ? (props.beats ?? 0) * props.beatMs : props.holdMs,
  () => {
    if (canAnimate(button.value)) {
      button.value.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }],
        { duration: PULSE_MS, easing: 'ease-out' },
      )
    }
    emit('confirm')
  },
  { restartOnPress: counting },
)

/**
 * The beat on the button, set only while held and frozen at release: the ring runs back after a
 * release, and a digit read off that ring would count 1, 2, 3 back up — a countdown that looks
 * like it is still running.
 */
const beat = ref<number | null>(null)
watch(holding, (isHolding) => {
  if (counting && isHolding) beat.value = props.beats ?? null
})
watch(progress, (value) => {
  const beats = props.beats
  if (beats === undefined || !holding.value) return
  beat.value = Math.min(beats, Math.max(1, beats - Math.floor(value * beats)))
})

const face = computed<{ text: string; shown: boolean } | null>(() => {
  if (!counting) return null
  if (holding.value) return { text: String(beat.value ?? props.beats), shown: true }
  if (progress.value > 0) return { text: String(beat.value ?? ''), shown: false }
  return { text: props.label, shown: true }
})

/**
 * `useHoldProgress` can end a hold on its own — the tab going to the background abandons it
 * without telling us. If `keyHeld` did not follow along, a key released while the tab was hidden
 * would never reach this document's `keyup`, and `keyHeld` would stay `true` forever, silently
 * swallowing every keyboard hold after that. Any path that ends the hold has to reset it.
 */
watch(
  holding,
  (isHolding) => {
    if (!isHolding) keyHeld.value = false
  },
  // Sync, not the default pre-flush: the tab-hidden path must clear `keyHeld` before the next
  // `keydown` can possibly arrive, not merely before the next render.
  { flush: 'sync' },
)

/**
 * Absent, then a spring: too large, then under, then over, then under, settling. The amplitude
 * sequence is the whole effect, which is why it is written as keyframes and not as spring
 * parameters. It carries the one thing the screen otherwise never says — this is where you play.
 *
 * Animated on [pop], the wrapper around both the button and the outline, not the button alone —
 * the outline is the button's sibling, not its child, so the button arriving on its own would
 * leave the outline sitting there from the first frame while the button springs in in front of
 * it. One wrapper, one animation, and the whole control pops in as a single object.
 */
watch(
  () => props.ready,
  (ready) => {
    if (!ready || !canAnimate(pop.value)) return
    pop.value.animate(
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

/**
 * A `disabled` element stops dispatching pointer events, so if `disabled` turns on mid-hold,
 * `pointerup` would never arrive and the hold would run to completion — firing a confirm on top of
 * whatever caused the disable, typically a request already in flight for the previous one.
 */
watch(
  () => props.disabled,
  (isDisabled) => {
    if (isDisabled) cancel()
  },
)

/** Shared by the pointer and keyboard paths — neither has any business starting a hold on its own. */
function startIfAllowed(): void {
  if (props.disabled || !props.ready) return
  start()
}

function beginHold(event: PointerEvent): void {
  // A right (or any non-primary, e.g. a secondary touch point) press must get no response at all —
  // not even a swallowed one. Without this a right mouse-down starts the hold the same as a left
  // one, `@contextmenu.prevent` then eats the browser's own context menu, and the combination reads
  // as total silence: having seen nothing happen, the user naturally holds a moment longer and
  // submits by accident. Keyboard holds go through [startIfAllowed] directly, not through here —
  // `event.button`/`isPrimary` are pointer-event concepts and have no keyboard equivalent.
  if (event.button !== 0 || !event.isPrimary) return
  startIfAllowed()
}

/**
 * Implicit pointer capture (set by the browser on `pointerdown` for direct manipulation) means
 * `pointerleave`/`pointerout` never fire while a touch drags across the button's own bounds — they
 * fire only once capture is released, i.e. at `pointerup`. So the universal "slide the thumb off to
 * cancel" gesture would otherwise reach nothing at all on a phone, and the hold would run to
 * completion regardless of how far the thumb has moved. Capture is exactly what keeps delivering
 * these moves here even once the point has left the element, which is what makes the hit test below
 * meaningful rather than moot — and exactly why capture must not be released early to "restore"
 * `pointerleave`: doing that would lose `pointerup` whenever the finger ends up off the element,
 * which is the very case this handler exists to catch.
 *
 * The test follows the shape the button paints: a round button must not keep the corners of its
 * box "inside", a square one must keep them.
 */
function onPointerMove(event: PointerEvent): void {
  const el = button.value
  if (!el) return
  const box = el.getBoundingClientRect()
  if (props.shape === 'square') {
    const inside =
      event.clientX >= box.left &&
      event.clientX <= box.right &&
      event.clientY >= box.top &&
      event.clientY <= box.bottom
    if (!inside) cancel()
    return
  }
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  const radius = Math.min(box.width, box.height) / 2
  const dx = event.clientX - cx
  const dy = event.clientY - cy
  if (dx * dx + dy * dy > radius * radius) cancel()
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== ' ' && event.key !== 'Enter') return
  // Swallowed so the page does not scroll and the button's own click never fires.
  event.preventDefault()
  if (event.repeat || keyHeld.value) return
  keyHeld.value = true
  startIfAllowed()
}

function onKeyUp(event: KeyboardEvent): void {
  if (event.key !== ' ' && event.key !== 'Enter') return
  keyHeld.value = false
  cancel()
}

/**
 * `closest-side` keeps this proportional at any wheel size. The thin band near the outer edge
 * is what makes the disc read as a ring rather than a filled circle, and, combined with the
 * outer box being noticeably larger than the button underneath (see the `-inset` below), with a
 * visible gap between the two. The thresholds are a *percentage of this box's own radius*, so
 * they scale with that box's own size — kept unscaled, the same percentage of a differently
 * sized radius would paint a visibly thicker or thinner rim than intended. Currently
 * `94.67%`/`95.78%`, rescaled from `95.2%`/`96.2%` when the box shrank from 50% to 45% of the
 * wheel's width (itself once rescaled from `90%`/`92%` at ~24%) — each rescale keeps the same
 * absolute pixel weight by scaling the distance from 100% by the old-box/new-box ratio.
 */
const ROUND_RIM = {
  mask: 'radial-gradient(closest-side, transparent 94.67%, #000 95.78%)',
  WebkitMask: 'radial-gradient(closest-side, transparent 94.67%, #000 95.78%)',
}

/**
 * The same rim for a square: four edge strips, unioned — the default way mask layers combine, so
 * no browser has to support `mask-composite`. A phone that skipped an `exclude` composite painted
 * the whole box instead, a thick band. A fixed width rather than a share of the button: the
 * square grows with Platzierung's board, and its rim must not grow with it.
 */
const SQUARE_RIM_PX = 2.5
const SQUARE_FRAME = [
  `linear-gradient(#000 0 0) top / 100% ${SQUARE_RIM_PX}px no-repeat`,
  `linear-gradient(#000 0 0) bottom / 100% ${SQUARE_RIM_PX}px no-repeat`,
  `linear-gradient(#000 0 0) left / ${SQUARE_RIM_PX}px 100% no-repeat`,
  `linear-gradient(#000 0 0) right / ${SQUARE_RIM_PX}px 100% no-repeat`,
].join(', ')
const SQUARE_RIM = { mask: SQUARE_FRAME, WebkitMask: SQUARE_FRAME }

/**
 * The hold-progress rim around the button: empty at rest, filled clockwise from 0° to 360° as the
 * hold runs. It stays visible under `prefers-reduced-motion` for free — nothing here is a
 * transition, `progress` is a plain number driven by `useHoldProgress`'s own
 * `requestAnimationFrame` loop.
 */
const ringStyle = computed(() => ({
  backgroundImage: `conic-gradient(currentColor ${progress.value * 360}deg, transparent ${progress.value * 360}deg 360deg)`,
  ...(props.shape === 'square' ? SQUARE_RIM : ROUND_RIM),
}))

/** Only the button's own colour — its resting visibility now lives on [popStyle], see below. */
const buttonStyle = computed(() => (props.color ? { backgroundColor: props.color } : {}))

/**
 * The resting appearance of the whole control (outline and button together), bound declaratively
 * to `ready` rather than left to the pop-in animation. `inert` makes the button unreachable while
 * not ready, but it is not visual — an inert button is still painted at full size unless something
 * says otherwise. The WAAPI animation above only covers the *transition*; on browsers or states
 * where it does not run at all (happy-dom, `prefers-reduced-motion`, a backgrounded tab), this is
 * what leaves the control correctly hidden beforehand and correctly visible afterwards. It sits on
 * the wrapper rather than the button so the outline — a sibling, not a child, of the button — is
 * hidden and shown along with it, not just during the animated transition between the two.
 */
const popStyle = computed(() => ({
  transform: props.ready ? 'scale(1)' : 'scale(0)',
  opacity: props.ready ? 1 : 0,
}))
</script>

<template>
  <!--
    This wrapper is the whole control, as far as sizing, resting visibility and the entrance
    animation are concerned — the outline (below) and the button are its children, and both arrive
    together because it, not the button alone, is what [popStyle] rests and the ready-watch above
    animates.
  -->
  <div ref="pop" data-test="hold-pop" class="relative size-full" :style="popStyle">
    <!--
      `-inset-[6.25%]` inflates this box by 6.25% of the button's own size on every side — 1.125×
      the button underneath. The wheel hands this component a slot 40% of its own width; at 1.125×
      that lands the outline at 45%, comfortably inside the band's inner edge at 78%, with the gap
      between button and outline coming from the mask above rather than from this box being any
      bigger than it has to be.
    -->
    <span
      data-test="hold-ring"
      aria-hidden="true"
      class="pointer-events-none absolute -inset-[6.25%] text-neutral-900"
      :class="{ 'rounded-full': props.shape === 'round' }"
      :style="ringStyle"
    />
    <!--
      `|| undefined` is not decoration: Vue keeps `inert="false"` in the DOM for a plain false,
      and it would still be in effect. See frontend-ui.md.
    -->
    <!--
      Four more ways a hold ends besides a plain `pointerup`, each observed in the wild: a long
      left-press near selectable text opens the browser's context menu partway through, which
      steals focus so `pointerup` never arrives — `@contextmenu.prevent` stops the menu from
      opening at all. `@blur` covers everything else that takes focus away, including a window
      that loses focus while staying visible (so `visibilitychange` never fires) — Cmd-Tabbing
      away mid-hold is exactly that case. `@lostpointercapture` covers the browser reclaiming
      capture on its own. `@pointermove` (handled by [onPointerMove], see above) covers the
      touch-only case none of the others do: a thumb sliding off the button onto the wheel around
      it, the universal "slide off to cancel" gesture — `pointerleave` never fires for it, because
      implicit pointer capture suppresses boundary events until release. `touch-none`/`select-none`
      mean the press itself never has text or a callout to fight over in the first place. All four
      route through `cancel()`, and the `watch(holding, …)` above already clears `keyHeld` once
      `holding` goes false — no second mechanism needed.
    -->
    <!-- cursor-pointer is explicit: Tailwind v4's preflight resets buttons to cursor:default. -->
    <button
      ref="button"
      data-test="hold-button"
      type="button"
      :inert="!props.ready || undefined"
      :aria-label="props.label"
      :disabled="props.disabled"
      :style="buttonStyle"
      class="absolute inset-0 cursor-pointer touch-none select-none disabled:cursor-not-allowed"
      :class="{
        'rounded-full': props.shape === 'round',
        'shadow-inner ring-1 ring-black/10': props.color !== undefined,
      }"
      @pointerdown="beginHold"
      @pointermove="onPointerMove"
      @pointerup="cancel"
      @pointercancel="cancel"
      @pointerleave="cancel"
      @lostpointercapture="cancel"
      @contextmenu.prevent
      @blur="cancel"
      @keydown="onKeyDown"
      @keyup="onKeyUp"
    >
      <span
        v-if="face !== null"
        data-test="hold-face"
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold tracking-wide text-white transition-opacity duration-150 motion-reduce:transition-none"
        :class="face.shown ? 'opacity-100' : 'opacity-0'"
      >
        {{ face.text }}
      </span>
    </button>
    <span v-if="counting" data-test="hold-beat" class="sr-only" aria-live="polite">
      {{ holding ? beat : '' }}
    </span>
  </div>
</template>
