<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { DateTime } from 'luxon'
import { useTitle } from '@vueuse/core'
import { activeCommunity } from '@/communities/context'
import CountdownDisplay from '@/communities/CountdownDisplay.vue'
import { yearSuffix as editionYearSuffix } from '@/communities/editionDate'
import { useAuth } from '@/auth/useAuth'
import NavDrawer from '@/nav/NavDrawer.vue'
import { navigationPending } from '@/ui/navigationProgress'
import { useColorSchemeShortcut } from '@/ui/colorScheme'

const { user } = useAuth()

useColorSchemeShortcut()

// Tab title follows the community in context, else the app name.
useTitle(computed(() => activeCommunity.value?.name ?? 'daily'))

// Top-left brand: the edition label, else the community name + a '<YY> edition suffix (always targetAt.year).
const brand = computed(
  () => activeCommunity.value?.editionLabel ?? activeCommunity.value?.name ?? 'daily',
)
const yearSuffix = computed(() => {
  const c = activeCommunity.value
  if (!c?.targetAt) return ''
  return editionYearSuffix(c.targetAt, c.targetTimezone)
})

const thisYear = DateTime.now().year

const hasCountdown = computed(() => Boolean(activeCommunity.value?.targetAt))

// From md the board shares row 1, and the row is then as tall as the board plus its legend (52px).
// Centring the title and the avatar in that row would sit them 9px below the middle of the digits,
// which reads as the avatar having come loose from the band it belongs to. So both are pinned to the
// top of the row inside a board-tall box instead: their centres land on the digits' centre line and
// the legend hangs below all three. Only with a board to align to — without one the cells keep their
// own 40px and the header stays at its old height.
const alignToBoardBand = computed(() => (hasCountdown.value ? 'md:h-[34px] md:self-start' : ''))
</script>

<template>
  <div class="flex min-h-screen flex-col overflow-x-clip bg-surface text-on-surface">
    <!-- The member row's fly-in travels the full viewport, and its own resting width can exceed
         it (many members on a narrow phone). Clipping horizontally here — the unpadded root,
         not `main` — is what keeps the page from gaining a scrollbar mid-animation without
         confining the animation to the content column. -->
    <div class="relative">
      <!-- The board needs its own row until there is width for it beside the title. Narrow: two rows,
           12px padding + 40px + 8px + 52px = 112px. From md: one row, 24px + 52px = 76px, with the
           board and the account menu together on the right and the slack between them and the title.
           md and not sm, because the widest cycle state is 314px and a long community name plus that
           board plus the avatar needs 647px — more than sm's 608px of content, which would push the
           row past the viewport. Without a countdown there is no second row at all and the header is
           52px (64px from md). No bottom padding: `main`'s own 16px is the gap to the content.
           From md the top padding is 24px, not 12px: the menu opens as a dialog whose top-right
           corner encloses the avatar by 8px, and 12px left it 1px short of the viewport's edge.
           Both cells of row 1 state their 40px: a grid track is as tall as its tallest item, and
           NavDrawer's toggle is 40px (a 32px avatar in a p-1 button). Stating it on the title cell
           alone would leave the login page, which has no NavDrawer, 8px shorter than every other
           page. -->
      <header
        class="relative mx-auto grid w-full max-w-6xl grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-4 pt-3 md:grid-cols-[1fr_auto_auto] md:pt-6"
      >
        <div
          data-test="title-row"
          class="col-start-1 row-start-1 flex h-10 min-w-0 items-center gap-2"
          :class="alignToBoardBand"
        >
          <RouterLink to="/" class="truncate text-3xl leading-10 font-light hover:underline"
            >{{ brand
            }}<span data-test="year-suffix" class="align-super text-base text-on-surface-variant">{{
              yearSuffix
            }}</span></RouterLink
          >
        </div>
        <!-- Account before countdown in the DOM, because that is the narrow layout's reading order
             (title, account, then the board on its own row) and phones are the common case. Grid
             placement moves the board between them from md up without reordering the markup. -->
        <div
          data-test="account-cell"
          class="col-start-2 row-start-1 flex h-10 items-center gap-1 md:col-start-3"
          :class="alignToBoardBand"
        >
          <NavDrawer v-if="user" :user="user" />
        </div>
        <div
          v-if="activeCommunity?.targetAt"
          data-test="countdown-row"
          class="col-span-2 col-start-1 row-start-2 h-[52px] md:col-span-1 md:col-start-2 md:row-start-1 md:self-start"
        >
          <CountdownDisplay :slug="activeCommunity.slug" />
        </div>
      </header>
      <!-- Absolute, so appearing costs no layout: the bar must not push <main> down. -->
      <div
        v-if="navigationPending"
        data-test="navigation-progress"
        role="progressbar"
        aria-label="Seite wird geladen"
        class="absolute inset-x-0 top-full h-1 overflow-hidden bg-outline"
      >
        <!-- A looping animation is physically unpleasant for some viewers, so reduced
             motion gets a static full-width fill instead — still legibly "busy". -->
        <div
          data-test="navigation-progress-segment"
          class="nav-shuttle h-full w-1/4 bg-primary motion-reduce:w-full"
        />
      </div>
    </div>
    <main class="flex-1 p-4">
      <RouterView />
    </main>
    <footer
      class="mx-auto flex w-full max-w-6xl flex-col items-end px-4 pt-8 pb-4 text-xs text-on-surface-variant"
    >
      <RouterLink to="/legal" class="hover:underline">Rechtliches</RouterLink>
      <p>© 2024 – {{ thisYear }} unividuell.org</p>
    </footer>
  </div>
</template>

<!--
  Indeterminate navigation bar: a segment shuttles right and back. The easing is the point — slow
  at the turns, fast through the middle — so the motion reads as deliberate rather than mechanical.
  The 1.4s cycle is tuned for the spans this actually covers (<5s): long enough not to look frantic,
  short enough that a one-second navigation still shows most of a traverse. translateX(300%) lands
  a 25%-wide segment exactly on the right edge. Motion is opt-in (`no-preference`): a scoped rule
  outranks Tailwind's layered `motion-reduce:animate-none`, so reduced motion is the default here.
-->
<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .nav-shuttle {
    animation: nav-shuttle 1.4s cubic-bezier(0.65, 0, 0.35, 1) infinite;
  }
}

@keyframes nav-shuttle {
  0% {
    transform: translateX(0);
  }
  50% {
    transform: translateX(300%);
  }
  100% {
    transform: translateX(0);
  }
}
</style>
