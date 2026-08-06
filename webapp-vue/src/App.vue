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
      <!-- Two rows with fixed heights, at every width: 24px padding + 40px + 8px + 44px = 116px.
           The height must not depend on the page, so row 2 stays reserved where no countdown lives,
           and BOTH cells of row 1 state their 40px: a grid track is as tall as its tallest item, and
           MemberMenu's trigger is 40px (a 32px avatar in a p-1 button). Stating it on the title cell
           alone would leave the login page, which has no MemberMenu, 8px shorter than every other
           page — the variance this height exists to remove. -->
      <header
        class="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 bg-stone-900 px-4 py-3 text-stone-50"
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
        <div data-test="account-cell" class="col-start-2 row-start-1 flex h-10 items-center">
          <MemberMenu v-if="user" :user="user" />
        </div>
        <div data-test="countdown-row" class="col-span-2 col-start-1 row-start-2 h-11">
          <CountdownDisplay v-if="activeCommunity?.startsAt" :slug="activeCommunity.slug" />
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
