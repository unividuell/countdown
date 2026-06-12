<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '@/auth/useAuth'

// `user` is guaranteed non-null here: the guard only admits status === 'authenticated',
// which implies user !== null (see useAuth.ts). The `?.` below only satisfies the type checker.
const { user, logout } = useAuth()
const logoutError = ref<string | null>(null)

async function handleLogout(): Promise<void> {
  logoutError.value = null
  try {
    await logout()
  } catch {
    logoutError.value = 'Logout failed. Please try again.'
  }
}
</script>

<template>
  <section class="mx-auto max-w-md py-8">
    <h1 class="mb-4 text-xl font-semibold">Welcome, {{ user?.username }}</h1>
    <dl class="mb-6 text-sm">
      <div class="flex gap-2">
        <dt class="font-medium">GitHub:</dt>
        <dd>{{ user?.githubLogin }}</dd>
      </div>
      <div class="flex gap-2">
        <dt class="font-medium">Email:</dt>
        <dd>{{ user?.email ?? '—' }}</dd>
      </div>
      <div class="flex gap-2">
        <dt class="font-medium">Super-admin:</dt>
        <dd>{{ user?.isSuperAdmin }}</dd>
      </div>
    </dl>
    <button class="rounded border px-3 py-1.5 hover:bg-neutral-200" @click="handleLogout">
      Log out
    </button>
    <p v-if="logoutError" class="mt-3 text-sm text-red-600">{{ logoutError }}</p>
  </section>
</template>
