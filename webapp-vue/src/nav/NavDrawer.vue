<script setup lang="ts">
/**
 * The app's only menu. Owns the open state and renders BOTH halves of it — the avatar toggle
 * that sits in the header, and the drawer teleported to <body>.
 *
 * Together in one component on purpose: the avatar drives the drawer like a wheel on a rail,
 * and travel and spin have to share one duration, one curve and one width. Split across two
 * components that agreement would have to be maintained by hand across a seam.
 */
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import {
  onKeyStroke,
  useEventListener,
  usePreferredReducedMotion,
  useScrollLock,
  useWindowSize,
} from '@vueuse/core'
import { useRoute } from 'vue-router'
import Avatar from '@/ui/Avatar.vue'
import { activeCommunity } from '@/communities/context'
import { useCommunities } from '@/communities/useCommunities'
import { spinDegrees } from './drawer'
import type { MeResponse } from '@/api/types'

defineProps<{ user: MeResponse }>()

/** Material's nav drawer: screen width minus 56dp, never wider than 320. */
const DRAWER_MAX_PX = 320
const DRAWER_VW = 0.85
/** Avatar.vue's `sm` is `size-8`. Pinned by a test, because the spin angle depends on it. */
const AVATAR_PX = 32

const open = ref(false)
const drawerTop = ref(0)
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const drawer = useTemplateRef<HTMLElement>('drawer')
const route = useRoute()
const { width: viewport } = useWindowSize()
const reduced = usePreferredReducedMotion()
const bodyLocked = useScrollLock(document.body)
// Only `refresh` is used here: the drawer's body is empty until Task 4 renders `active`.
const { refresh } = useCommunities()

// The width lives here rather than in a Tailwind class: the spin angle needs the same number,
// and two sources for one width drift the moment somebody edits one of them.
const drawerWidth = computed(() => Math.min(DRAWER_MAX_PX, Math.round(viewport.value * DRAWER_VW)))

const spin = computed(() =>
  open.value && reduced.value !== 'reduce' ? spinDegrees(drawerWidth.value, AVATAR_PX) : 0,
)

const showDot = computed(
  () => Boolean(activeCommunity.value?.viewerIsAdmin) && (activeCommunity.value?.pendingCount ?? 0) > 0,
)
const toggleLabel = computed(() => {
  const base = open.value ? 'Menü schließen' : 'Menü öffnen'
  return showDot.value ? `${base}, offene Anfragen` : base
})

function loadCommunities(): void {
  // A failed list leaves every other block of the drawer working.
  refresh().catch((e) => console.error('could not load the community list', e))
}
onMounted(loadCommunities)

/**
 * The header scrolls away with the page, so its bottom edge is read at open time rather than
 * assumed. Scrolled past, the edge is negative and the clamp gives the drawer the full height —
 * which is right: there is no header left to stay below. The scroll lock is what keeps the
 * measured value from going stale while the drawer is up.
 */
function measureTop(): void {
  const header = trigger.value?.closest('header')
  drawerTop.value = Math.max(0, header?.getBoundingClientRect().bottom ?? 0)
}

async function setOpen(next: boolean): Promise<void> {
  if (next) {
    measureTop()
    loadCommunities()
    open.value = true
    await nextTick()
    drawer.value?.focus()
  } else {
    open.value = false
    trigger.value?.focus()
  }
}

watch(open, (v) => {
  bodyLocked.value = v
})

// Every navigating entry closes the drawer this way, which is why a click inside is NOT wired
// to close: a failed logout has to keep it open to show its message.
watch(
  () => route.fullPath,
  () => {
    open.value = false
  },
)

onKeyStroke('Escape', () => {
  if (open.value) void setOpen(false)
})

// onClickOutside is not used: happy-dom's event shim does not satisfy it, so a test written
// against it cannot pass. This listens directly and checks containment itself.
useEventListener(document, 'click', (e: Event) => {
  if (!open.value) return
  const target = e.target as Node
  if (drawer.value?.contains(target) || trigger.value?.contains(target)) return
  void setOpen(false)
})

// A minimal focus cycle rather than a focus-trap dependency. The toggle is part of the cycle
// because it is also the close button.
onKeyStroke('Tab', (e) => {
  if (!open.value) return
  const inDrawer = Array.from(
    drawer.value?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [],
  )
  const items = [trigger.value, ...inDrawer].filter((el): el is HTMLElement => Boolean(el))
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) return
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
})
</script>

<template>
  <button
    ref="trigger"
    data-test="nav-toggle"
    type="button"
    :aria-label="toggleLabel"
    aria-haspopup="dialog"
    :aria-expanded="open"
    aria-controls="nav-drawer"
    class="flex cursor-pointer items-center rounded p-1 hover:bg-stone-800"
    @click="setOpen(!open)"
  >
    <!-- The spin lives on this wrapper, not on Avatar itself, so the rotation cannot fight
         whatever transform the avatar uses for its own label. -->
    <span
      data-test="nav-spinner"
      class="relative flex transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:transition-none"
      :style="{ transform: `rotate(${spin}deg)` }"
    >
      <Avatar v-bind="user.avatar" size="sm" />
      <span
        v-if="showDot"
        data-test="pending-dot"
        aria-hidden="true"
        class="absolute -top-0.5 -right-0.5 size-2 rounded-full border border-stone-900 bg-blue-600"
      />
    </span>
  </button>

  <Teleport to="body">
    <div
      data-test="nav-scrim"
      aria-hidden="true"
      class="fixed inset-0 z-10 bg-black/45 transition-opacity duration-300 ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:duration-150"
      :class="open ? 'opacity-100' : 'pointer-events-none opacity-0'"
    />
    <aside
      id="nav-drawer"
      ref="drawer"
      data-test="nav-drawer"
      role="dialog"
      aria-modal="true"
      aria-label="Menü"
      tabindex="-1"
      :inert="!open || undefined"
      :aria-hidden="!open || undefined"
      :style="{ width: `${drawerWidth}px`, top: `${drawerTop}px` }"
      class="fixed right-0 bottom-0 z-20 flex flex-col bg-white text-neutral-900 shadow-2xl transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)] outline-none motion-reduce:transition-none"
      :class="open ? 'translate-x-0' : 'translate-x-full'"
    >
      <!-- Content lands here in the next task. -->
    </aside>
  </Teleport>
</template>
