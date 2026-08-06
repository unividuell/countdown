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
      <!-- Two rows with fixed heights, at every width: 24px padding + 32px + 8px + 44px = 108px.
           The height must not depend on the page, so row 2 stays reserved where no countdown
           lives, and row 1 gets its 32px from h-8 rather than from the avatar — on the login page
           there is no MemberMenu to supply it. -->
      <header
        class="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 bg-stone-900 px-4 py-3 text-stone-50"
      >
        <div
          data-test="title-row"
          class="col-start-1 row-start-1 flex h-8 min-w-0 items-center gap-2"
        >
          <CommunityMenu v-if="activeCommunity" :community="activeCommunity" />
          <RouterLink to="/" class="font-semibold hover:underline"
            >{{ brand }}<span class="text-stone-400">{{ yearSuffix }}</span></RouterLink
          >
        </div>
        <div class="col-start-2 row-start-1 flex items-center">
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
