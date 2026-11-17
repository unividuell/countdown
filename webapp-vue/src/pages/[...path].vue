<script setup lang="ts">
import { RouterLink } from 'vue-router'

definePage({ meta: { public: true } })
</script>

<template>
  <section class="mx-auto max-w-md py-8 text-center">
    <h1 class="mb-2 text-lg font-semibold">Seite nicht gefunden</h1>
    <p class="mb-4 text-sm text-on-surface-variant">Diese Adresse gibt es nicht.</p>
    <RouterLink to="/" class="text-sm text-primary hover:underline">Zur Übersicht</RouterLink>
  </section>
</template>
