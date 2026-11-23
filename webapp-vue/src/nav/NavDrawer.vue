<script setup lang="ts">
/**
 * The app's only menu. Owns the open state and renders BOTH halves of it — the avatar toggle
 * that sits in the header, and the drawer teleported to <body>.
 *
 * Together in one component on purpose: the avatar drives the drawer like a wheel on a rail,
 * and travel and spin have to share one duration, one curve and one width. Split across two
 * components that agreement would have to be maintained by hand across a seam.
 *
 * The sound switch stands left of the avatar and, like it, stays where it is when the menu opens:
 * one place in every game, in the header rather than on any card.
 */
import {
  computed,
  nextTick,
  onMounted,
  ref,
  useTemplateRef,
  watch,
  type ComponentPublicInstance,
} from 'vue'
import {
  onKeyStroke,
  useEventListener,
  useMediaQuery,
  useMutationObserver,
  usePreferredReducedMotion,
  useScrollLock,
  useWindowSize,
} from '@vueuse/core'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import IconAudio from '~icons/lucide/audio-lines'
import IconImage from '~icons/lucide/image'
import IconChevronDown from '~icons/lucide/chevron-down'
import IconPlus from '~icons/lucide/plus'
import Avatar from '@/ui/Avatar.vue'
import BrandMark from '@/ui/BrandMark.vue'
import SoundToggle from '@/ui/SoundToggle.vue'
import ColorSchemeSwitch from './ColorSchemeSwitch.vue'
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
/** The toggle's box, read at open time: both the drawer and the dialog are laid out round it. */
const toggleBox = ref({ top: 0, bottom: 0, left: 0, right: 0, viewportRight: 0, rowLeft: 0 })
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const sound = useTemplateRef<ComponentPublicInstance>('sound')
/** The sound switch's button; it sits on the toggle's row, outside the frame like the toggle. */
const soundButton = (): HTMLElement | null => (sound.value?.$el as HTMLElement | undefined) ?? null
const drawer = useTemplateRef<HTMLElement>('drawer')
const spinner = useTemplateRef<HTMLElement>('spinner')
const scrim = useTemplateRef<HTMLElement>('scrim')
const route = useRoute()
const router = useRouter()
const { logout } = useAuth()
const { width: viewport } = useWindowSize()

/**
 * Mobile-first: a drawer from the right, where the header stacks into two rows. From `md`, where
 * it is one row, a centred dialog — a drawer's height is wasted on a wide screen.
 */
const asDialog = useMediaQuery('(min-width: 48rem)')
const reduced = usePreferredReducedMotion()
const bodyLocked = useScrollLock(document.body)
const { active, refresh } = useCommunities()
const logoutFailed = ref(false)

// The width lives here rather than in a Tailwind class: the spin angle needs the same number,
// and two sources for one width drift the moment somebody edits one of them.
const drawerWidth = computed(() => Math.min(DRAWER_MAX_PX, Math.round(viewport.value * DRAWER_VW)))

// Only the drawer has a rail for the avatar to roll along.
const spin = computed(() =>
  open.value && reduced.value !== 'reduce' && !asDialog.value
    ? spinDegrees(drawerWidth.value, AVATAR_PX)
    : 0,
)

/** Room the dialog leaves round the toggle it encloses; also the name's gap to the toggle. */
const ENCLOSE_PX = 8

/**
 * Where the frame stands, in the viewport. The drawer runs from the top to the right edge; the
 * dialog's top-right corner sits ENCLOSE_PX outside the toggle, so the toggle is anchored in it.
 */
const frame = computed(() => {
  const t = toggleBox.value
  return asDialog.value
    ? { top: t.top - ENCLOSE_PX, right: t.right + ENCLOSE_PX }
    : { top: 0, right: t.viewportRight }
})

// The content starts under the toggle. Scrolled past, the toggle's edge is negative and the clamp
// starts the drawer's content at the top.
const frameStyle = computed(() => {
  const t = toggleBox.value
  const top = frame.value.top
  const paddingTop = `${Math.max(0, t.bottom - top)}px`
  return asDialog.value
    ? {
        top: `${top}px`,
        right: `${t.viewportRight - frame.value.right}px`,
        paddingTop,
        maxHeight: `calc(100dvh - ${top + 16}px)`,
      }
    : { width: `${drawerWidth.value}px`, paddingTop }
})

/** The viewer's name, on the toggle's row: from the frame's left edge up to the sound switch. */
const nameStyle = computed(() => {
  const t = toggleBox.value
  return {
    top: `${t.top - frame.value.top}px`,
    height: `${t.bottom - t.top}px`,
    right: `${frame.value.right - t.rowLeft + ENCLOSE_PX}px`,
  }
})

const viewerName = computed(
  () => activeCommunity.value?.viewerIdentity?.username ?? props.user.username,
)

/**
 * Crossing md swaps the closed frame's classes — a drawer translated off becomes a dialog faded
 * out — and with transitions on, the browser animates between the two: the menu flashes up. So the
 * switch renders without transitions; a forced style read commits it before they come back.
 */
const switchingMode = ref(false)

watch(asDialog, async () => {
  switchingMode.value = true
  await nextTick()
  void drawer.value?.offsetWidth
  switchingMode.value = false
})

const drawerClasses = computed(() => [
  'inset-y-0 right-0 transition-[translate,box-shadow]',
  open.value ? 'translate-x-0 shadow-2xl' : 'translate-x-full',
])

const dialogClasses = computed(() => [
  'w-80 origin-top-right rounded-xl shadow-2xl transition-[opacity,scale]',
  open.value ? 'scale-100 opacity-100' : 'scale-95 opacity-0',
])

const showDot = computed(
  () =>
    Boolean(activeCommunity.value?.viewerIsAdmin) && (activeCommunity.value?.pendingCount ?? 0) > 0,
)
const toggleLabel = computed(() => {
  const base = open.value ? 'Menü schließen' : 'Menü öffnen'
  return showDot.value ? `${base}, offene Anfragen` : base
})

/**
 * The active community always gets a row, even before `listCommunities` resolves or if it comes
 * back without it: that row carries the only link to the image pool, and the pool must not depend
 * on a second request succeeding.
 */
const entries = computed(() => {
  const list = communityEntries(active.value, activeCommunity.value?.slug ?? null)
  const current = activeCommunity.value
  if (!current || list.some((e) => e.current)) return list
  return [
    ...list,
    { id: `active:${current.slug}`, name: current.name, slug: current.slug, current: true },
  ]
})
// The list only earns its rows when there is somewhere to switch to; the create entry shares
// the block, so the block itself outlives the list.
const showSwitcher = computed(() => entries.value.length > 1)
const mayCreate = computed(() => props.user.mayCreateCommunities)
/**
 * Also true for a lone community with nothing to switch to: its row is the only way to the image
 * pool, so hiding the block would take the pool with it.
 */
const showCommunityBlock = computed(
  () => showSwitcher.value || mayCreate.value || !!activeCommunity.value,
)
const admin = computed(() => (activeCommunity.value?.viewerIsAdmin ? activeCommunity.value : null))
// What the header shows is what the others see right now: inside a community that is the
// community-bound identity, everywhere else the global one.
const toggleAvatar = computed(
  () => activeCommunity.value?.viewerIdentity?.avatar ?? props.user.avatar,
)
const profilePath = computed(() =>
  activeCommunity.value ? communityPath(activeCommunity.value.slug, 'profile') : '/profile',
)

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
const LINK = `${ROW} cursor-pointer hover:bg-surface-container`

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

const navScroll = useTemplateRef<HTMLElement>('navScroll')
const navMark = useTemplateRef<HTMLElement>('navMark')
const scrollHintVisible = ref(false)

/**
 * The cue answers one question: is there a row below the fold the reader has not seen? The logo is
 * the answer's edge, not `scrollHeight` — the mark grows into whatever slack is left, so a list
 * that ends well above the bottom would otherwise keep the cue up forever, pointing at nothing but
 * the logo. `offsetTop` is a layout value the scroll offset does not move, so it stays comparable
 * to `scrollTop`; the `scrollHeight` branch only covers a layout that has not happened yet.
 */
function updateScrollHint(): void {
  const el = navScroll.value
  if (!el) {
    scrollHintVisible.value = false
    return
  }
  const mark = navMark.value
  const cutoff = mark && mark.offsetTop > 0 ? mark.offsetTop : el.scrollHeight - 1
  scrollHintVisible.value = el.scrollTop + el.clientHeight <= cutoff
}

// The rows are not all there when the drawer opens: the community list is still in flight. It
// lands as child mutations, and without this the cue would be decided against a list that had not
// arrived yet — leaving no hint at all on precisely the overflowing drawer it exists for.
useMutationObserver(navScroll, updateScrollHint, { childList: true, subtree: true })

function loadCommunities(): void {
  // A failed list leaves every other block of the drawer working.
  refresh().catch((e) => console.error('could not load the community list', e))
}

onMounted(loadCommunities)

/**
 * The toggle stays above the open frame, which is laid out round it. Read at open time, because
 * the header scrolls away with the page; the scroll lock keeps the value from going stale while
 * the frame is up.
 *
 * The right edge is the scrim's: it is fixed and inset 0, so its box is exactly the frame a fixed
 * `right` counts from. Not `clientWidth`: with a classic scrollbar the lock keeps the gutter
 * reserved yet `clientWidth` then counts it as content, so a re-measure while open (a resize) put
 * the dialog 15px too far left.
 */
function measureToggle(): void {
  const r = trigger.value?.getBoundingClientRect()
  toggleBox.value = {
    top: r?.top ?? 0,
    bottom: r?.bottom ?? 0,
    left: r?.left ?? 0,
    right: r?.right ?? 0,
    viewportRight: scrim.value?.getBoundingClientRect().right ?? 0,
    rowLeft: soundButton()?.getBoundingClientRect().left ?? r?.left ?? 0,
  }
}

async function setOpen(next: boolean): Promise<void> {
  if (next) {
    logoutFailed.value = false
    measureToggle()
    loadCommunities()
    open.value = true
    await nextTick()
    drawer.value?.focus()
    updateScrollHint()
  } else {
    open.value = false
    trigger.value?.focus()
  }
}

/**
 * The dialog has no rail for the avatar to roll along, so it answers a press with a boing
 * instead: squashed, overshooting, settled. `scale`, not `transform`, so it composes with the
 * spin's rotate rather than replacing it.
 */
const BOING: Keyframe[] = [
  { scale: 1 },
  { scale: 0.82, offset: 0.25 },
  { scale: 1.12, offset: 0.55 },
  { scale: 0.97, offset: 0.8 },
  { scale: 1 },
]

watch(open, (v) => {
  bodyLocked.value = v
  if (asDialog.value && reduced.value !== 'reduce') {
    spinner.value?.animate?.(BOING, { duration: 450, easing: 'ease-out' })
  }
})

// drawerWidth and spin already track the viewport through useWindowSize(); the toggle's box does
// not, because measureToggle() only runs at open time. Without this, a resize or orientation
// change while the frame is open leaves it stale — the first row under the toggle, or the dialog
// beside it. Gated on open: closed, there is nothing to re-measure, and the open-time call in
// setOpen still runs first for the initial value.
watch(viewport, () => {
  if (open.value) {
    measureToggle()
    updateScrollHint()
  }
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
// Captured, before the target's own listener: the sound switch's click swaps its icon, and a
// browser renders that in a microtask before the click bubbles up here — a target already
// detached is inside nothing, and the menu closed under the finger.
useEventListener(
  document,
  'click',
  (e: Event) => {
    if (!open.value) return
    const target = e.target as Node
    if ([drawer.value, trigger.value, soundButton()].some((el) => el?.contains(target))) return
    void setOpen(false)
  },
  { capture: true },
)

// A minimal focus cycle rather than a focus-trap dependency. The toggle is part of the cycle
// because it is also the close button; the sound switch beside it stays reachable too.
onKeyStroke('Tab', (e) => {
  if (!open.value) return
  // Contract: this selector must list every focusable element the drawer can contain — the
  // standard focusables rather than only what today's own markup happens to use, and anything
  // with a non-negative [tabindex]. The spec's cage test reuses this selector, so it cannot catch
  // an omission here.
  const inDrawer = Array.from(
    drawer.value?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? [],
  )
  const items = [soundButton(), trigger.value, ...inDrawer].filter((el): el is HTMLElement =>
    Boolean(el),
  )
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
  <!-- Above scrim and frame like the toggle, so the open menu shows it where it was. -->
  <SoundToggle
    ref="sound"
    data-test="nav-sound"
    class="relative z-30 flex size-10 cursor-pointer items-center justify-center rounded-full hover:ring-2 hover:ring-on-surface/20"
  />
  <button
    ref="trigger"
    data-test="nav-toggle"
    type="button"
    :aria-label="toggleLabel"
    aria-haspopup="dialog"
    :aria-expanded="open"
    aria-controls="nav-drawer"
    class="relative z-30 flex cursor-pointer items-center rounded-full p-1 hover:ring-2 hover:ring-on-surface/20"
    @click="setOpen(!open)"
  >
    <!-- The spin lives on this wrapper, not on Avatar itself, so the rotation cannot fight
         whatever transform the avatar uses for its own label. -->
    <span
      ref="spinner"
      data-test="nav-spinner"
      class="relative flex transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:transition-none"
      :style="{ transform: `rotate(${spin}deg)` }"
    >
      <Avatar v-bind="toggleAvatar" size="sm" />
      <span
        v-if="showDot"
        data-test="pending-dot"
        aria-hidden="true"
        class="absolute -top-0.5 -right-0.5 size-2 rounded-full border border-surface bg-primary"
      />
    </span>
  </button>

  <Teleport to="body">
    <div
      ref="scrim"
      data-test="nav-scrim"
      aria-hidden="true"
      class="fixed inset-0 z-10 bg-scrim/45 transition-opacity duration-300 ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:duration-150"
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
      :style="frameStyle"
      class="raised fixed z-20 flex flex-col bg-surface-container-high text-on-surface duration-300 ease-[cubic-bezier(.4,0,.2,1)] outline-none motion-reduce:transition-none"
      :class="[asDialog ? dialogClasses : drawerClasses, switchingMode && 'transition-none!']"
    >
      <!-- Whose menu this is, on the toggle's row; a touch stronger than the rows below. -->
      <div
        v-if="toggleBox.bottom > 0"
        data-test="nav-viewer"
        class="absolute left-0 flex items-center pl-5 text-sm font-medium"
        :style="nameStyle"
      >
        <span class="truncate">{{ viewerName }}</span>
      </div>
      <div class="relative flex min-h-0 flex-1 flex-col">
        <div
          ref="navScroll"
          data-test="nav-scroll"
          class="flex min-h-0 flex-1 flex-col overflow-y-auto pt-1.5"
          @scroll="updateScrollHint"
        >
          <template v-if="showCommunityBlock">
            <template v-for="e in entries" :key="e.id">
              <div
                v-if="e.current"
                data-test="current-community"
                aria-current="true"
                :class="`${ROW} text-on-surface/40`"
              >
                {{ e.name }}
                <!-- The live things in a row that is otherwise a label, which is why they keep
                     full contrast while the name stays grey. Packed as one group, 32px wide and
                     44px tall each, so the name keeps the width: the frontend-ui tap-target
                     exception, like Anmaßung's tools. -->
                <span class="ml-auto flex shrink-0">
                  <RouterLink
                    :to="communityPath(e.slug, 'images')"
                    data-test="community-images"
                    aria-label="Bilder"
                    class="flex h-11 w-8 shrink-0 items-center justify-center text-on-surface"
                  >
                    <IconImage class="size-4" aria-hidden="true" />
                  </RouterLink>
                  <RouterLink
                    :to="communityPath(e.slug, 'audio')"
                    data-test="community-audio"
                    aria-label="Audio"
                    class="flex h-11 w-8 shrink-0 items-center justify-center text-on-surface"
                  >
                    <IconAudio class="size-4" aria-hidden="true" />
                  </RouterLink>
                </span>
              </div>
              <button
                v-else-if="showSwitcher"
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
              :class="`${LINK} text-on-surface-variant`"
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
              class="mt-1.5 border-t border-outline"
            />
            <div
              data-test="admin-heading"
              class="px-5 pt-3 pb-1 text-xs font-semibold tracking-wide text-on-surface/40 uppercase"
            >
              {{ admin.name }}
            </div>
            <RouterLink :to="communityPath(admin.slug, 'requests')" :class="LINK">
              Anfragen
              <span
                v-if="admin.pendingCount > 0"
                data-test="pending-count"
                class="ml-auto rounded-full bg-primary px-1.5 text-xs text-on-primary"
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
            ref="navMark"
            data-test="nav-mark"
            class="grid shrink-0 grow basis-auto place-items-center px-3 py-6 text-outline"
          >
            <BrandMark class="w-[200px] max-w-full" />
          </div>
        </div>

        <div
          v-if="scrollHintVisible"
          data-test="nav-scroll-cue"
          aria-hidden="true"
          class="pointer-events-none absolute inset-x-0 bottom-0 flex h-12 items-end justify-center bg-gradient-to-t from-surface-container-high via-surface-container-high/80 to-transparent pb-1 text-on-surface/40"
        >
          <IconChevronDown
            class="size-4 animate-bounce [animation-iteration-count:2] motion-reduce:animate-none"
          />
        </div>
      </div>

      <div data-test="nav-foot" class="flex-none pb-1.5">
        <div class="border-t border-outline" />
        <ColorSchemeSwitch />
        <RouterLink :to="profilePath" data-test="edit-profile" :class="LINK">
          Profil bearbeiten
        </RouterLink>
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
        <p v-if="logoutFailed" data-test="logout-error" class="px-5 py-1 text-xs text-error">
          Abmelden fehlgeschlagen
        </p>
      </div>
    </aside>
  </Teleport>
</template>
