<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import IconMember from '~icons/lucide/circle-user'
import HeaderMenu from '@/ui/HeaderMenu.vue'
import { useAuth } from '@/auth/useAuth'

const router = useRouter()
const { user, logout } = useAuth()
const failed = ref(false)
// Read .value in script, not in the template: `user` is a destructured composable
// return, so Vue's template compiler can only auto-unwrap it via a runtime isRef()
// check. A plain script access needs no such check, and re-wrapping the result in
// its own computed() gives the template a binding it can statically resolve.
const username = computed(() => user.value?.username)

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
      {{ username }}
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
