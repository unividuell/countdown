<script setup lang="ts"></script>

<template>
  <div class="flex min-h-screen flex-col bg-neutral-100 text-neutral-900">
    <header class="bg-stone-900 px-4 py-3 text-stone-50">
      <span class="font-semibold">countdown</span>
    </header>
    <main class="flex-1 p-4">
      <RouterView />
    </main>
    <footer class="bg-stone-900 px-4 py-3 text-sm text-stone-300">countdown.unividuell.org</footer>
  </div>
</template>
