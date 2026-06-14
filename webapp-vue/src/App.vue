<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { DateTime } from 'luxon'
import { useTitle } from '@vueuse/core'
import { activeCommunity } from '@/communities/context'
import CountdownDisplay from '@/communities/CountdownDisplay.vue'

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
      <RouterLink to="/" class="font-semibold hover:underline"
        >{{ brand }}<span class="text-stone-400">{{ yearSuffix }}</span></RouterLink
      >
      <CountdownDisplay v-if="activeCommunity?.startsAt" :slug="activeCommunity.slug" />
    </header>
    <main class="flex-1 p-4">
      <RouterView />
    </main>
    <footer class="bg-stone-900 px-4 py-3 text-sm text-stone-300">countdown.unividuell.org</footer>
  </div>
</template>
