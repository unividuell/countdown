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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { createSwarm, defaultTuning, MAX_TILT_DEG, type Swarm } from './swarm'
import { readableTextColor } from './readableTextColor'
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

const props = defineProps<{ members: RosterMemberResponse[] }>()

const row = ref<HTMLElement | null>(null)
const settled = ref(false)
let items: HTMLElement[] = []
let swarm: Swarm | null = null
let raf = 0
let lastFrame = 0

const textColors = computed(() => props.members.map((m) => readableTextColor(m.bgColorHex)))

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

function finish(): void {
  swarm = null
  for (const el of items) el.style.transform = ''
  // Only now may the row go `overflow-x: auto` — mid-flight it's `overflow-x: clip` instead (the
  // row's own ~372px natural width for nine members would otherwise overflow the document),
  // paired with `overflow-y: visible` since `clip`, unlike `visible`, isn't coerced to `auto` and
  // so won't cut the flying circles off at the ~62px band.
  settled.value = true
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
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
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
    :class="settled ? 'no-scrollbar overflow-x-auto' : 'overflow-x-clip overflow-y-visible'"
    style="visibility: hidden"
  >
    <div class="flex -space-x-2 p-0.5">
      <div
        v-for="(m, index) in members"
        :key="m.userId"
        data-swarm-item
        role="img"
        class="flex w-12 shrink-0 flex-col -space-y-1.5 will-change-transform"
        :style="{ zIndex: members.length - index }"
        :aria-label="ariaLabel(m)"
        :title="m.fullName"
      >
        <div
          data-swarm-circle
          class="flex size-12 place-content-around rounded-full ring-2 ring-white"
          :style="{ background: m.bgColorHex, color: textColors[index] }"
        >
          <div class="place-self-center rotate-[-40deg] text-sm font-medium">{{ m.shortName }}</div>
        </div>
        <div
          class="h-4 w-6 place-self-center overflow-hidden rounded-lg bg-yellow-400 text-center text-xs whitespace-nowrap text-neutral-900 ring-1 ring-white"
        >
          {{ m.points.stable }}
        </div>
        <span
          v-if="m.points.live"
          data-test="live-points"
          class="z-20 animate-pulse self-end rounded-lg bg-rose-600 px-1 text-xs text-white ring-1 ring-yellow-400 motion-reduce:animate-none"
        >
          +{{ m.points.live }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Tailwind v4 has no scrollbar utility; on a phone this strip is swiped, and a visible
   horizontal scrollbar there is a layout bug rather than an affordance. */
.no-scrollbar {
  scrollbar-width: none;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
