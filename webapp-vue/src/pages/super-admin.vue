<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useAuth } from '@/auth/useAuth'

// The access check lives in the shell so no child page can forget it — and because
// <RouterView/> is inside the v-else, a non-super-admin never mounts a child and therefore
// never issues a request. The backend rule on the super-admin path is the real gate; this is UX.
//
// The shell renders no chrome of its own: App.vue already supplies the header, and the way back
// into the area is the MemberMenu entry, which is present on every page.
const { user } = useAuth()
</script>

<template>
  <div v-if="!user?.isSuperAdmin" class="mx-auto max-w-md py-8 text-center">
    <h1 class="mb-2 text-lg font-semibold">Kein Zugriff</h1>
    <p class="text-sm text-neutral-600">Dieser Bereich ist Super-Admins vorbehalten.</p>
  </div>
  <RouterView v-else />
</template>
