<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { useAuth } from '@/auth/useAuth'

// Unlinked area: nothing in the app navigates here, you type the URL. The access check lives
// in the shell so no child page can forget it — and because <RouterView/> is inside the v-else,
// a non-super-admin never mounts a child and therefore never issues a request. The backend
// rule on /api/super-admin/** is the real gate; this is UX.
const { user } = useAuth()
</script>

<template>
  <div v-if="!user?.isSuperAdmin" class="mx-auto max-w-md py-8 text-center">
    <h1 class="mb-2 text-lg font-semibold">Kein Zugriff</h1>
    <p class="text-sm text-neutral-600">Dieser Bereich ist Super-Admins vorbehalten.</p>
  </div>
  <div v-else>
    <header class="mb-4 flex items-center justify-between border-b px-4 py-2">
      <RouterLink to="/super-admin" class="font-semibold hover:underline">Super-Admin</RouterLink>
      <span class="text-sm text-neutral-600">{{ user.username }}</span>
    </header>
    <RouterView />
  </div>
</template>
