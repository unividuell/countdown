<script setup lang="ts">
// Placeholder for Task 15, which replaces this body entirely. Kept here only so
// `SongSnippetGame.vue` (Task 14) has a real component to switch to and `vue-tsc` stays green —
// the props accepted here are exactly what `SongSnippetGame.vue` passes.
import type { GameEntry } from '@/games/GameEntry'
import type { SongSnippetSolution } from './types'

defineProps<{
  solution: SongSnippetSolution
  durations: number[]
  entries: GameEntry[]
  mineUserId: string | null
  // `| undefined` (not a bare `?`) because `SongSnippetGame` always binds this attribute — never
  // omits it — passing through its own optional prop, which can itself be `undefined`; see the
  // `exactOptionalPropertyTypes` note in `frontend.md` and `LabControls.vue`/`MemberRow.vue` for
  // the same shape.
  assetUrl?: ((key: number) => string) | undefined
}>()
</script>

<template>
  <div data-test="song-snippet-reveal-placeholder" />
</template>
