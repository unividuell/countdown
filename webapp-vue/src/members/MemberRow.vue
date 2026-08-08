<script setup lang="ts">
/**
 * The ranking row, ported from the origin app's UserStatus, plus a fly-in.
 *
 * The row is laid out normally and only carries a `transform`, so the resting place is by
 * definition offset 0 and the layout never moves. Transforms are written straight to the DOM
 * rather than through reactive state — 120 substeps a second through Vue's scheduler would be
 * pointless work.
 *
 * Resting positions and element references are measured once on mount, so `members` is expected
 * to stay stable for the component's lifetime. A consumer whose roster can change must remount
 * it (for example with a `:key`) rather than mutate the prop in place.
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { createSwarm, defaultTuning, MAX_TILT_DEG, type Swarm } from './swarm'
import Avatar from '@/ui/Avatar.vue'
import { prefersReducedMotion } from '@/ui/motion'
import type { RosterMemberResponse } from '@/api/types'

const MAX_TILT_RAD = (MAX_TILT_DEG * Math.PI) / 180

/**
 * `translate3d(...) rotate(...)` pivots on the *element's own* centre — the item column's
 * centre, not the circle centre the swarm positions the particle at (the pill below the circle
 * drags the column's centre down). So keeping the circle a plain `wallRadius` from the stage
 * edge isn't enough: at full tilt, the far corner of the taller, off-centre column can still
 * swing past the edge even though the circle itself never would. This finds, per item, how far
 * the circle centre must stay from the edge for the whole rotated column to stay inside on
 * every side.
 */
function requiredMargin(col: DOMRect, circle: DOMRect): number {
  const hw = col.width / 2
  const hh = col.height / 2
  const dx = Math.abs(hw - (circle.left + circle.width / 2 - col.left))
  const dy = Math.abs(hh - (circle.top + circle.height / 2 - col.top))
  const hw2 = hw * Math.cos(MAX_TILT_RAD) + hh * Math.sin(MAX_TILT_RAD)
  const hh2 = hw * Math.sin(MAX_TILT_RAD) + hh * Math.cos(MAX_TILT_RAD)
  return Math.max(hw2 + dx, hh2 + dy)
}

defineProps<{ members: RosterMemberResponse[] }>()

const row = ref<HTMLElement | null>(null)
const settled = ref(false)
let items: HTMLElement[] = []
let swarm: Swarm | null = null
let raf = 0
let lastFrame = 0

// `role="img"` is Children Presentational: True, pruning the `+N` live-points badge's text node
// from the accessibility tree — so the live points must be folded into the label itself here.
function ariaLabel(m: RosterMemberResponse): string {
  const live = m.points.live ? `, plus ${m.points.live} live` : ''
  return `${m.fullName}, ${m.points.stable} Punkte${live}`
}

function paint(): void {
  if (!swarm) return
  for (let i = 0; i < items.length; i++) {
    const el = items[i]
    const p = swarm.particles[i]
    if (!el || !p) continue
    el.style.transform = `translate3d(${p.x - p.tx}px, ${p.y - p.ty}px, 0) rotate(${p.tilt}deg)`
  }
}

/**
 * Firefox keeps a scroll container's offset in the session history entry and restores it on
 * reload — but this row only *becomes* a container when it settles, so the restore lands seconds
 * into the visit, right after the fly-in has come to rest: the row silently jumps back to
 * wherever the reader had left it. The row is a ranking, so a reload has to start at the leader.
 * Writing the offset ourselves also drops Firefox's pending restore; the extra frame is for the
 * restore being applied in the reflow that first builds the scroll frame, which is after the
 * `nextTick` this runs in.
 */
function scrollToLeader(): void {
  const host = row.value
  if (!host) return
  host.scrollLeft = 0
  raf = requestAnimationFrame(() => {
    host.scrollLeft = 0
  })
}

function finish(): void {
  swarm = null
  for (const el of items) el.style.transform = ''
  // Only now may the row go `overflow-x: auto` — it computes `overflow-y` to `auto` too, which
  // would cut flying circles off at the ~72px band. Mid-flight the row must not clip on either
  // axis at all: the circles travel far outside it, across the whole viewport. Horizontal
  // containment during the flight lives on the app root instead (see App.vue).
  settled.value = true
  void nextTick(scrollToLeader)
}

function tick(now: number): void {
  if (!swarm) return
  const dt = Math.min(0.05, (now - lastFrame) / 1000)
  lastFrame = now
  swarm.step(dt)
  if (swarm.finished) return finish()
  paint()
  raf = requestAnimationFrame(tick)
}

onMounted(() => {
  const host = row.value
  if (!host) return
  items = [...host.querySelectorAll<HTMLElement>('[data-swarm-item]')]
  const reduced = prefersReducedMotion()
  if (!reduced && items.length > 0) {
    const margins: number[] = []
    const targets = items.map((el) => {
      // The circle, not the column: collisions are circle-to-circle, and the points pill below
      // would drag the centre downwards.
      const circle = el.querySelector<HTMLElement>('[data-swarm-circle]') ?? el
      const col = el.getBoundingClientRect()
      const r = circle.getBoundingClientRect()
      margins.push(requiredMargin(col, r))
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    // Only some members carry the `+N` live badge, so columns differ in height — take the
    // worst case across the row rather than assuming a uniform column.
    const measuredMargin = Math.max(...margins)
    const wallRadius =
      measuredMargin > 0 && Number.isFinite(measuredMargin)
        ? measuredMargin
        : defaultTuning.wallRadius
    swarm = createSwarm({
      targets,
      // The layout viewport, not `window.innerWidth/Height`: those include a classic scrollbar's
      // width, which `getBoundingClientRect` — what the targets above are measured with — does not.
      stage: {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      },
      tuning: { ...defaultTuning, wallRadius },
    })
    // Paint the scattered start before revealing, so the row never flashes in place first.
    paint()
    lastFrame = performance.now()
    raf = requestAnimationFrame(tick)
  } else {
    settled.value = true
    void nextTick(scrollToLeader)
  }
  host.style.visibility = 'visible'
})

onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <div
    ref="row"
    data-test="row"
    class="flex w-full"
    :class="settled ? 'overflow-x-auto' : 'overflow-visible'"
    style="visibility: hidden"
  >
    <div class="flex shrink-0 -space-x-2 p-0.5">
      <div
        v-for="(m, index) in members"
        :key="m.userId"
        data-swarm-item
        role="img"
        class="flex w-12 shrink-0 flex-col will-change-transform"
        :style="{ zIndex: members.length - index }"
        :aria-label="ariaLabel(m)"
        :title="m.fullName"
      >
        <Avatar :short-name="m.shortName" :bg-color-hex="m.bgColorHex" data-swarm-circle />
        <div
          class="-mt-1.5 h-4 w-6 place-self-center overflow-hidden rounded-lg bg-yellow-400 text-center text-xs whitespace-nowrap text-neutral-900 ring-1 ring-white"
        >
          {{ m.points.stable }}
        </div>
        <span
          v-if="m.points.live"
          data-test="live-points"
          class="z-20 -mt-1.5 animate-pulse self-end rounded-lg bg-rose-600 px-1 text-xs text-white ring-1 ring-yellow-400 motion-reduce:animate-none"
        >
          +{{ m.points.live }}
        </span>
      </div>
    </div>
  </div>
</template>
