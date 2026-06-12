<script setup lang="ts">
import { useAuth } from '@/auth/useAuth'

definePage({ meta: { public: true } })

const { loginWithGitHub } = useAuth()
</script>

<template>
  <section class="mx-auto max-w-sm py-16 text-center">
    <h1 class="mb-6 text-xl font-semibold">Sign in</h1>
    <button
      data-test="login-github"
      class="rounded bg-stone-900 px-4 py-2 text-stone-50 hover:bg-stone-700"
      @click="loginWithGitHub"
    >
      Login with GitHub
    </button>
  </section>
</template>
