<script setup lang="ts">
/**
 * The ranking row, ported from the origin app's UserStatus, plus two movements: the fly-in that
 * belongs to entering the community, and the rearrangement that belongs to a guess having moved
 * the standings.
 *
 * The row is laid out normally and only carries a `transform`, so the resting place is by
 * definition offset 0 and the layout never moves. Transforms are written straight to the DOM
 * rather than through reactive state — 120 substeps a second through Vue's scheduler would be
 * pointless work. Exactly one movement owns those transforms at a time.
 *
 * The fly-in measures its resting places once on mount and cannot be re-aimed afterwards, so a
 * roster that changes mid-flight ends it: the row comes to rest, in the new order, rather than
 * having two movements pull at the same avatars. From then on `members` may change freely — the
 * order is patched in place, keyed by `userId`, and the rearrangement below measures its own
 * geometry each time. Remounting for that would replay the whole fly-in, hence `useRoster.refresh`.
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createSwarm, defaultTuning, MAX_TILT_DEG, type Swarm, type Vec } from './swarm'
import { planReorder, reorderTuning } from './reorder'
import Avatar from '@/ui/Avatar.vue'
import { inBackground, prefersReducedMotion } from '@/ui/motion'
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

const props = defineProps<{
  members: RosterMemberResponse[]
  /** The viewer, when known. Only their own rise is worth boxing for. */
  meId?: string | undefined
}>()

const row = ref<HTMLElement | null>(null)
const settled = ref(false)
const rearranging = ref(false)
/** Who is currently travelling, and who is doing the overtaking — the row's stacking order. */
const lifted = ref<ReadonlySet<string>>(new Set())
const riserId = ref<string | null>(null)
/** The reader's scroll offset, carried by the track while the row is not a scroll container. */
const trackShift = ref(0)

/** The elements the running movement paints, in its own particle order. */
let painted: HTMLElement[] = []
let swarm: Swarm | null = null
let onSettled: () => void = () => {}
let entering = false
let heldScrollLeft = 0
let raf = 0
let lastFrame = 0

// `role="img"` is Children Presentational: True, pruning the live-points chip's text node from the
// accessibility tree — so the live points must be folded into the label itself here. „vorläufig“
// travels with them: visually it is carried by a colour and a pulse, neither of which a screen
// reader passes on.
function ariaLabel(m: RosterMemberResponse): string {
  return `${m.fullName}, ${m.points.stable} Punkte${liveSuffix(m)}`
}

function liveSuffix(m: RosterMemberResponse): string {
  const live = m.points.live
  if (live === undefined) return ''
  if (live.points === 0) return ', diese Runde ohne Punkte'
  return live.provisional
    ? `, diese Runde vorläufig +${live.points}`
    : `, diese Runde +${live.points}`
}

/** Empty for a member who has not played: the chip stays in the flow, holding the row's height. */
function liveLabel(m: RosterMemberResponse): string {
  const live = m.points.live
  if (live === undefined) return ''
  // A nought beside the stable badge's nought read as one two-digit number; the skull says „played,
  // came away empty“ without competing with a number. The screen-reader wording lives in
  // `liveSuffix`, so the emoji never has to carry it.
  return live.points > 0 ? `+${live.points}` : '💀'
}

/**
 * Whether the number can still move is the server's answer (`provisional`), not a re-derivation from
 * the award rule here.
 *
 * One colour per meaning, so the state is never carried by punctuation: yellow is the standing total,
 * dark is „this round is done“, rose and pulsing is „still up for grabs“. A settled chip in the
 * badge's own yellow was the obvious reading of „same colour as stable“ and the wrong one — stacked
 * under one avatar, `5` above `+6` reads as one two-line number, with a 12px plus sign as the only
 * thing telling them apart.
 */
function liveChipClass(m: RosterMemberResponse): string {
  const live = m.points.live
  if (live === undefined) return 'invisible'
  return live.provisional
    ? 'animate-pulse bg-live text-white ring-yellow-400 motion-reduce:animate-none'
    : 'bg-neutral-900 text-white ring-white'
}

function paint(): void {
  if (!swarm) return
  for (let i = 0; i < painted.length; i++) {
    const el = painted[i]
    const p = swarm.particles[i]
    if (!el || !p) continue
    el.style.transform = `translate3d(${p.x - p.tx}px, ${p.y - p.ty}px, 0) rotate(${p.tilt}deg)`
  }
}

function release(): void {
  for (const el of painted) el.style.transform = ''
}

function itemsById(): Map<string, HTMLElement> {
  const out = new Map<string, HTMLElement>()
  for (const el of row.value?.querySelectorAll<HTMLElement>('[data-swarm-item]') ?? []) {
    if (el.dataset.memberId) out.set(el.dataset.memberId, el)
  }
  return out
}

/**
 * The circle, not the column: what travels and collides is the avatar, and the points pill below
 * it would drag the measured centre downwards.
 */
function centreOf(item: HTMLElement): Vec {
  const r = (item.querySelector<HTMLElement>('[data-swarm-circle]') ?? item).getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

function measureCentres(): Map<string, Vec> {
  const out = new Map<string, Vec>()
  for (const [id, el] of itemsById()) out.set(id, centreOf(el))
  return out
}

function zIndexOf(id: string, index: number): number {
  // The resting row stacks leader-first, so a member climbing towards the front would slide *under*
  // everyone it overtakes. Whoever moves is lifted clear of that, and the one boxing through on top.
  if (id === riserId.value) return props.members.length + 2
  if (lifted.value.has(id)) return props.members.length + 1
  return props.members.length - index
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

/** Ends whichever movement is running and hands the avatars back to the layout. */
function finish(): void {
  cancelAnimationFrame(raf)
  swarm = null
  release()
  const done = onSettled
  onSettled = () => {}
  done()
}

function entered(): void {
  entering = false
  // Only now may the row go `overflow-x: auto` — it computes `overflow-y` to `auto` too, which
  // would cut flying circles off at the ~72px band. Mid-flight the row must not clip on either
  // axis at all: the circles travel far outside it, across the whole viewport. Horizontal
  // containment during the flight lives on the app root instead (see App.vue).
  settled.value = true
  void nextTick(scrollToLeader)
}

function rearranged(): void {
  lifted.value = new Set()
  riserId.value = null
  rearranging.value = false
  trackShift.value = 0
  // The row becomes a scroll container again only on the next render, and it comes back at zero.
  void nextTick(() => {
    if (row.value) row.value.scrollLeft = heldScrollLeft
  })
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

/**
 * A guess has moved the standings. The order is already in the DOM by now; `before` holds where
 * the avatars stood a moment ago, and the swarm carries them from there to where they now belong.
 *
 * Running in the microtask after Vue's patch is what keeps the new order from ever being painted:
 * the transforms that put everyone back are written in the same task the reorder happened in.
 */
function rearrange(before: Map<string, Vec>): void {
  const host = row.value
  if (!host) return
  // A second refresh mid-movement continues from wherever the avatars actually are — which is what
  // `before` caught — but the new resting places have to be measured without the old transforms,
  // and the running loop has to go: every frame schedules the next, so leaving it would step the
  // swarm twice a frame from two chains that never end.
  cancelAnimationFrame(raf)
  swarm = null
  release()

  const plan = planReorder({ before, after: measureCentres(), meId: props.meId })
  if (!plan) {
    // Nothing left to move, but a movement may have been running: hand the row back to the layout,
    // or it keeps the reader's scroll offset on the track and never clips again.
    if (rearranging.value) rearranged()
    return
  }

  const els = itemsById()
  painted = plan.entries.map((e) => els.get(e.id)!)
  // Reading it after the row has stopped clipping would read zero, and the reader would be thrown
  // back to the leader for the length of the movement.
  if (!rearranging.value) heldScrollLeft = host.scrollLeft
  trackShift.value = -heldScrollLeft
  lifted.value = plan.moving
  riserId.value = plan.riserId
  rearranging.value = true

  swarm = createSwarm({
    targets: plan.entries,
    stage: {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    },
    tuning: reorderTuning,
  })
  onSettled = rearranged
  paint()
  lastFrame = performance.now()
  raf = requestAnimationFrame(tick)
}

watch(
  () => props.members.map((m) => m.userId).join(','),
  () => {
    // A `pre` watcher runs before this component re-renders, so the row still stands in the old
    // order here and can be measured — the one moment where that is still true.
    if (entering) return finish()
    if (prefersReducedMotion() || inBackground()) return
    if (!row.value) return
    const before = measureCentres()
    void nextTick(() => rearrange(before))
  },
)

onMounted(() => {
  const host = row.value
  if (!host) return
  painted = [...host.querySelectorAll<HTMLElement>('[data-swarm-item]')]
  const reduced = prefersReducedMotion()
  if (!reduced && painted.length > 0) {
    const margins: number[] = []
    const targets = painted.map((el) => {
      const circle = el.querySelector<HTMLElement>('[data-swarm-circle]') ?? el
      margins.push(requiredMargin(el.getBoundingClientRect(), circle.getBoundingClientRect()))
      return centreOf(el)
    })
    // Worst case across the row rather than a single measured column: the live chip holds its line
    // for everyone, but an avatar that renders a shade taller than its neighbours still would not.
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
    entering = true
    onSettled = entered
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
    :class="settled && !rearranging ? 'overflow-x-auto' : 'overflow-visible'"
    style="visibility: hidden"
  >
    <div
      data-test="track"
      class="flex shrink-0 -space-x-2 p-0.5"
      :style="{ transform: rearranging ? `translateX(${trackShift}px)` : '' }"
    >
      <div
        v-for="(m, index) in members"
        :key="m.userId"
        data-swarm-item
        :data-member-id="m.userId"
        role="img"
        class="flex w-12 shrink-0 flex-col will-change-transform"
        :style="{ zIndex: zIndexOf(m.userId, index) }"
        :aria-label="ariaLabel(m)"
        :title="m.fullName"
      >
        <Avatar :short-name="m.shortName" :bg-color-hex="m.bgColorHex" data-swarm-circle />
        <div
          class="-mt-1.5 h-4 w-6 place-self-center overflow-hidden rounded-lg bg-yellow-400 text-center text-xs whitespace-nowrap text-neutral-900 ring-1 ring-white"
        >
          {{ m.points.stable }}
        </div>
        <!-- Always in the flow, only ever hidden: a chip that comes and goes takes the row's height
             with it, and the section around it centres what is left — which is the vertical jump the
             ranking made the moment the first live points landed. `h-4` is what `text-xs` gives the
             chip anyway, written down so an empty one keeps it. -->
        <span
          data-test="live-points"
          class="z-20 -mt-1.5 h-4 self-end rounded-lg px-1 text-xs whitespace-nowrap ring-1"
          :class="liveChipClass(m)"
          >{{ liveLabel(m) }}</span
        >
      </div>
    </div>
  </div>
</template>
