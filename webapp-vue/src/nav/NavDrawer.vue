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
import { RouterLink, useRoute, useRouter } from 'vue-router'
import IconCheck from '~icons/lucide/check'
import IconPlus from '~icons/lucide/plus'
import Avatar from '@/ui/Avatar.vue'
import BrandMark from '@/ui/BrandMark.vue'
import { useAuth } from '@/auth/useAuth'
import { activeCommunity } from '@/communities/context'
import { communityPath } from '@/communities/routes'
import { useCommunities } from '@/communities/useCommunities'
import { communityEntries, spinDegrees } from './drawer'
import type { MeResponse } from '@/api/types'

const props = defineProps<{ user: MeResponse }>()

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
const router = useRouter()
const { logout } = useAuth()
const { width: viewport } = useWindowSize()
const reduced = usePreferredReducedMotion()
const bodyLocked = useScrollLock(document.body)
const { active, refresh } = useCommunities()
const logoutFailed = ref(false)

// The width lives here rather than in a Tailwind class: the spin angle needs the same number,
// and two sources for one width drift the moment somebody edits one of them.
const drawerWidth = computed(() => Math.min(DRAWER_MAX_PX, Math.round(viewport.value * DRAWER_VW)))

const spin = computed(() =>
  open.value && reduced.value !== 'reduce' ? spinDegrees(drawerWidth.value, AVATAR_PX) : 0,
)

const showDot = computed(
  () =>
    Boolean(activeCommunity.value?.viewerIsAdmin) && (activeCommunity.value?.pendingCount ?? 0) > 0,
)
const toggleLabel = computed(() => {
  const base = open.value ? 'Menü schließen' : 'Menü öffnen'
  return showDot.value ? `${base}, offene Anfragen` : base
})

const entries = computed(() => communityEntries(active.value, activeCommunity.value?.slug ?? null))
// The list only earns its rows when there is somewhere to switch to; the create entry shares
// the block, so the block itself outlives the list.
const showSwitcher = computed(() => entries.value.length > 1)
const mayCreate = computed(() => props.user.mayCreateCommunities)
const showCommunityBlock = computed(() => showSwitcher.value || mayCreate.value)
const admin = computed(() => (activeCommunity.value?.viewerIsAdmin ? activeCommunity.value : null))

/**
 * One row's geometry, stated once: 44px is the touch-target floor. `shrink-0` is load-bearing,
 * not decorative — `nav-scroll` is `flex flex-col`, and flex items shrink by default. A fixed
 * height on a flex item is a request, not a guarantee: measured on a 812x375 landscape phone,
 * the scroll area already overflowed (clientHeight 212 vs scrollHeight 433) yet the flex
 * algorithm still squashed every row from 44px down to 20px before letting it overflow — while
 * `nav-mark`, which already carries `shrink-0`, kept its full 248px. The squeeze bought nothing:
 * the container was going to scroll either way.
 */
const ROW = 'flex h-11 w-full shrink-0 items-center gap-2.5 px-5 text-left text-sm'
const LINK = `${ROW} cursor-pointer hover:bg-neutral-100`

function go(slug: string): void {
  router.push(communityPath(slug)).catch((e) => console.error('navigation failed', e))
}

async function handleLogout(): Promise<void> {
  logoutFailed.value = false
  try {
    await logout()
  } catch (e) {
    // useAuth keeps local auth state on failure — the session may still be alive.
    console.error('logout failed', e)
    logoutFailed.value = true
    return
  }
  router.replace('/login').catch((e) => console.error('navigation failed', e))
}

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
    logoutFailed.value = false
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

// drawerWidth and spin already track the viewport through useWindowSize(); drawerTop does not,
// because measureTop() only runs at open time. Without this, a resize or orientation change
// while the drawer is open (e.g. a community header that goes from two rows to one across the
// `md` breakpoint) leaves drawerTop stale — either a gap of scrimmed page above the drawer, or
// the drawer's first row hidden behind the header. Gated on open: closed, there is nothing to
// re-measure, and the open-time call in setOpen still runs first for the initial value.
watch(viewport, () => {
  if (open.value) measureTop()
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
  // Contract: this selector must list every focusable element the drawer can contain. It only
  // covers links and buttons because that is all today's drawer has — an <input>, a <select>,
  // or anything with [tabindex] added later must be added here too, or Tab will silently skip
  // it. The spec's own cage test reuses this selector, so it cannot catch that omission either.
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
      <div data-test="nav-scroll" class="flex min-h-0 flex-1 flex-col overflow-y-auto pt-1.5">
        <template v-if="showCommunityBlock">
          <template v-for="e in showSwitcher ? entries : []" :key="e.id">
            <div
              v-if="e.current"
              data-test="current-community"
              aria-current="true"
              :class="`${ROW} text-neutral-400`"
            >
              {{ e.name }}
              <IconCheck class="ml-auto size-4" aria-hidden="true" />
            </div>
            <button
              v-else
              type="button"
              data-test="switch-community"
              :class="LINK"
              @click="go(e.slug)"
            >
              {{ e.name }}
            </button>
          </template>

          <!-- No divider above this: creating a community is the same thought as switching. -->
          <RouterLink
            v-if="mayCreate"
            to="/communities/new"
            data-test="create-community"
            :class="`${LINK} text-neutral-600`"
          >
            <IconPlus class="size-4" aria-hidden="true" />
            Spielgemeinschaft
          </RouterLink>
        </template>

        <template v-if="admin">
          <!-- Separates the admin block from the community block above — only when there is
               one, otherwise it would sit flush against the header seam as a stray rule. -->
          <div
            v-if="showCommunityBlock"
            data-test="admin-divider"
            class="mt-1.5 border-t border-neutral-200"
          />
          <div
            data-test="admin-heading"
            class="px-5 pt-3 pb-1 text-xs font-semibold tracking-wide text-neutral-400 uppercase"
          >
            {{ admin.name }}
          </div>
          <RouterLink :to="communityPath(admin.slug, 'requests')" :class="LINK">
            Anfragen
            <span
              v-if="admin.pendingCount > 0"
              data-test="pending-count"
              class="ml-auto rounded-full bg-blue-600 px-1.5 text-xs text-white"
              >{{ admin.pendingCount }}</span
            >
          </RouterLink>
          <RouterLink :to="communityPath(admin.slug, 'members')" :class="LINK"
            >Mitglieder</RouterLink
          >
          <RouterLink :to="communityPath(admin.slug, 'settings')" :class="LINK"
            >Einstellungen</RouterLink
          >
        </template>

        <!-- grow takes the slack and centres the mark in it; shrink-0 means a long list grows
             the scroll height instead of squeezing the mark away. -->
        <div
          data-test="nav-mark"
          class="grid shrink-0 grow basis-auto place-items-center px-3 py-6 text-neutral-300"
        >
          <BrandMark class="w-[200px] max-w-full" />
        </div>
      </div>

      <div data-test="nav-foot" class="flex-none pb-1.5">
        <div class="border-t border-neutral-200" />
        <RouterLink
          v-if="user.isSuperAdmin"
          to="/super-admin"
          data-test="super-admin"
          :class="LINK"
        >
          Super-Admin
        </RouterLink>
        <button type="button" data-test="logout" :class="LINK" @click="handleLogout">
          Abmelden
        </button>
        <p v-if="logoutFailed" data-test="logout-error" class="px-5 py-1 text-xs text-red-600">
          Abmelden fehlgeschlagen
        </p>
      </div>
    </aside>
  </Teleport>
</template>
