<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import IconMember from '~icons/lucide/circle-user'
import HeaderMenu from '@/ui/HeaderMenu.vue'
import { useAuth } from '@/auth/useAuth'

const router = useRouter()
const { user, logout } = useAuth()
const failed = ref(false)

async function handleLogout(): Promise<void> {
  failed.value = false
  try {
    await logout()
  } catch (e) {
    // useAuth keeps local auth state on failure — the session may still be alive.
    console.error('logout failed', e)
    failed.value = true
    return
  }
  router.replace('/login').catch((e) => console.error('navigation failed', e))
}
</script>

<template>
  <HeaderMenu label="Konto-Menü" align="right" data-test="member-menu">
    <template #trigger><IconMember class="size-5" /></template>

    <div data-test="current-user" class="px-3 pt-1 pb-0.5 text-xs text-neutral-500">
      {{ user?.username }}
    </div>
    <button
      type="button"
      data-test="logout"
      class="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-100"
      @click="handleLogout"
    >
      Abmelden
    </button>
    <p v-if="failed" data-test="logout-error" class="px-3 py-1 text-xs text-red-600">
      Abmelden fehlgeschlagen
    </p>
  </HeaderMenu>
</template>
