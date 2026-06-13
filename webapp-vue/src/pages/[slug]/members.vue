<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  listMembers,
  approveMember,
  promoteMember,
  demoteMember,
  removeMember,
} from '@/api/communities'
import type { MemberResponse } from '@/api/types'

const route = useRoute('/[slug]/members')
const slug = route.params.slug
const members = ref<MemberResponse[]>([])
const error = ref<string | null>(null)

async function load(): Promise<void> {
  members.value = await listMembers(slug)
}
async function run(fn: () => Promise<void>): Promise<void> {
  error.value = null
  try {
    await fn()
    await load()
  } catch {
    error.value = 'Aktion fehlgeschlagen.'
  }
}
onMounted(load)
</script>

<template>
  <section class="mx-auto max-w-lg py-8">
    <h1 class="mb-4 text-xl font-semibold">Mitglieder</h1>
    <p v-if="error" class="mb-3 text-sm text-red-600">{{ error }}</p>
    <ul class="space-y-2">
      <li
        v-for="m in members"
        :key="m.userId"
        class="flex items-center justify-between gap-2 border-b py-2 text-sm"
      >
        <span
          >{{ m.username }}
          <em class="text-neutral-500">({{ m.status }}{{ m.isAdmin ? ', Admin' : '' }})</em></span
        >
        <span class="flex gap-2">
          <button
            v-if="m.status === 'PENDING'"
            data-test="approve"
            class="rounded border px-2 py-0.5"
            @click="run(() => approveMember(slug, m.userId))"
          >
            Bestätigen
          </button>
          <button
            v-if="m.status === 'ACTIVE' && !m.isAdmin"
            class="rounded border px-2 py-0.5"
            @click="run(() => promoteMember(slug, m.userId))"
          >
            Zu Admin
          </button>
          <button
            v-if="m.status === 'ACTIVE' && m.isAdmin"
            class="rounded border px-2 py-0.5"
            @click="run(() => demoteMember(slug, m.userId))"
          >
            Admin entz.
          </button>
          <button
            class="rounded border px-2 py-0.5 text-red-600"
            @click="run(() => removeMember(slug, m.userId))"
          >
            Entfernen
          </button>
        </span>
      </li>
    </ul>
  </section>
</template>
