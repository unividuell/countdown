<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { DateTime } from 'luxon'
import { useTitle } from '@vueuse/core'
import { activeCommunity } from '@/communities/context'
import CountdownDisplay from '@/communities/CountdownDisplay.vue'
import { useAuth } from '@/auth/useAuth'
import CommunityMenu from '@/communities/CommunityMenu.vue'
import MemberMenu from '@/auth/MemberMenu.vue'
import { navigationPending } from '@/ui/navigationProgress'

const { user } = useAuth()

// Tab title follows the community in context, else the app name.
useTitle(computed(() => activeCommunity.value?.name ?? 'countdown'))

// Top-left brand: the active community's title + a '<YY> edition suffix (always startsAt.year).
const brand = computed(() => activeCommunity.value?.name ?? 'countdown')
const yearSuffix = computed(() => {
  const c = activeCommunity.value
  if (!c?.startsAt) return ''
  const year = DateTime.fromISO(c.startsAt, { zone: c.startsAtTimezone }).year
  return ` '${String(year).slice(-2)}`
})
</script>

<template>
  <div class="flex min-h-screen flex-col overflow-x-clip bg-neutral-100 text-neutral-900">
    <!-- The member row's fly-in travels the full viewport, and its own resting width can exceed
         it (many members on a narrow phone). Clipping horizontally here — the unpadded root,
         not `main` — is what keeps the page from gaining a scrollbar mid-animation without
         confining the animation to the content column. -->
    <div class="relative">
      <!-- The board needs its own row until there is width for it beside the title. Narrow: two rows,
           24px padding + 40px + 8px + 44px = 116px. From md: one row, 24px + 44px = 68px, with the
           board and the account menu together on the right and the slack between them and the title.
           md and not sm, because the widest cycle state is 303px and a long community name plus that
           board plus the avatar needs 636px — more than sm's 608px of content, which would push the
           row past the viewport. Without a countdown there is no second row at all and the header is
           back to its old 64px.
           Both cells of row 1 state their 40px: a grid track is as tall as its tallest item, and
           MemberMenu's trigger is 40px (a 32px avatar in a p-1 button). Stating it on the title cell
           alone would leave the login page, which has no MemberMenu, 8px shorter than every other
           page. -->
      <header
        class="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 bg-stone-900 px-4 py-3 text-stone-50 md:grid-cols-[1fr_auto_auto]"
      >
        <div
          data-test="title-row"
          class="col-start-1 row-start-1 flex h-10 min-w-0 items-center gap-2"
        >
          <CommunityMenu v-if="activeCommunity" :community="activeCommunity" />
          <RouterLink to="/" class="font-semibold hover:underline"
            >{{ brand }}<span class="text-stone-400">{{ yearSuffix }}</span></RouterLink
          >
        </div>
        <!-- Account before countdown in the DOM, because that is the narrow layout's reading order
             (title, account, then the board on its own row) and phones are the common case. Grid
             placement moves the board between them from md up without reordering the markup. -->
        <div
          data-test="account-cell"
          class="col-start-2 row-start-1 flex h-10 items-center md:col-start-3"
        >
          <MemberMenu v-if="user" :user="user" />
        </div>
        <div
          v-if="activeCommunity?.startsAt"
          data-test="countdown-row"
          class="col-span-2 col-start-1 row-start-2 h-11 md:col-span-1 md:col-start-2 md:row-start-1"
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
        class="absolute inset-x-0 top-full h-1 overflow-hidden bg-stone-300"
      >
        <!-- A looping animation is physically unpleasant for some viewers, so reduced
             motion gets a static full-width fill instead — still legibly "busy". -->
        <div
          data-test="navigation-progress-segment"
          class="animate-nav-shuttle h-full w-1/4 bg-blue-600 motion-reduce:w-full motion-reduce:animate-none"
        />
      </div>
    </div>
    <main class="flex-1 p-4">
      <RouterView />
    </main>
    <footer class="bg-stone-900 px-4 py-3 text-sm text-stone-300">countdown.unividuell.org</footer>
  </div>
</template>
