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

const { status } = useAuth()

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
  <div class="flex min-h-screen flex-col bg-neutral-100 text-neutral-900">
    <header class="flex items-center justify-between gap-4 bg-stone-900 px-4 py-3 text-stone-50">
      <div class="flex items-center gap-2">
        <CommunityMenu v-if="activeCommunity" :community="activeCommunity" />
        <RouterLink to="/" class="font-semibold hover:underline"
          >{{ brand }}<span class="text-stone-400">{{ yearSuffix }}</span></RouterLink
        >
      </div>
      <div class="flex items-center gap-3">
        <CountdownDisplay v-if="activeCommunity?.startsAt" :slug="activeCommunity.slug" />
        <MemberMenu v-if="status === 'authenticated'" />
      </div>
    </header>
    <div
      v-if="navigationPending"
      data-test="navigation-progress"
      role="progressbar"
      aria-label="Seite wird geladen"
      class="h-0.5 w-full animate-pulse bg-blue-500"
    />
    <main class="flex-1 p-4">
      <RouterView />
    </main>
    <footer class="bg-stone-900 px-4 py-3 text-sm text-stone-300">countdown.unividuell.org</footer>
  </div>
</template>
