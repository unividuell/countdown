<script setup lang="ts">
import { useAuth } from '@/auth/useAuth'

const { user, logout } = useAuth()
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
    <button class="rounded border px-3 py-1.5 hover:bg-neutral-200" @click="logout">Log out</button>
  </section>
</template>
