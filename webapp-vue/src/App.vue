<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { useTitle } from '@vueuse/core'
import { activeCommunityName } from '@/communities/context'

// Tab title follows the community in context, else the app name.
useTitle(computed(() => activeCommunityName.value ?? 'countdown'))
</script>

<template>
  <div class="flex min-h-screen flex-col bg-neutral-100 text-neutral-900">
    <header class="bg-stone-900 px-4 py-3 text-stone-50">
      <RouterLink to="/" class="font-semibold hover:underline">countdown</RouterLink>
    </header>
    <main class="flex-1 p-4">
      <RouterView />
    </main>
    <footer class="bg-stone-900 px-4 py-3 text-sm text-stone-300">countdown.unividuell.org</footer>
  </div>
</template>
