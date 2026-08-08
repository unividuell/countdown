<script setup lang="ts">
import { ref, watch } from 'vue'
import { parseSeed } from './seed'

const props = defineProps<{ seed: number; returnPath: string; busy: boolean }>()
const emit = defineEmits<{
  apply: [seed: number]
  roll: []
  reset: []
  forgetMine: []
  refresh: []
}>()

const draft = ref(String(props.seed))
watch(
  () => props.seed,
  (next) => (draft.value = String(next)),
)

function apply(): void {
  const parsed = parseSeed(draft.value)
  if (parsed !== null) emit('apply', parsed)
}
</script>

<template>
  <div class="mb-4 space-y-3 rounded-lg border border-dashed border-neutral-300 p-3">
    <form class="flex gap-2" @submit.prevent="apply">
      <label class="sr-only" for="lab-seed">Seed</label>
      <input
        id="lab-seed"
        v-model="draft"
        data-test="lab-seed"
        inputmode="numeric"
        class="min-h-11 w-full rounded-md border border-neutral-300 px-3 font-mono"
      />
      <button type="submit" class="min-h-11 shrink-0 rounded-md border px-3">Setzen</button>
      <button
        type="button"
        data-test="lab-roll"
        class="min-h-11 shrink-0 rounded-md border px-3"
        @click="emit('roll')"
      >
        Würfeln
      </button>
    </form>
    <div class="flex flex-wrap gap-2 text-sm">
      <button
        type="button"
        data-test="lab-refresh"
        :disabled="props.busy"
        class="min-h-11 rounded-md border px-3"
        @click="emit('refresh')"
      >
        Aktualisieren
      </button>
      <button
        type="button"
        data-test="lab-reset"
        :disabled="props.busy"
        class="min-h-11 rounded-md border px-3"
        @click="emit('reset')"
      >
        Runde zurücksetzen
      </button>
      <button
        type="button"
        data-test="lab-forget-mine"
        :disabled="props.busy"
        class="min-h-11 rounded-md border px-3"
        @click="emit('forgetMine')"
      >
        Meinen Guess löschen
      </button>
      <!-- Full page load, not router navigation: the picker is server-rendered HTML, and the
           redirect brings us back to this exact seed so a player switch does not cost the round. -->
      <a
        data-test="lab-switch-player"
        :href="`/login/github?redirect=${encodeURIComponent(props.returnPath)}`"
        class="flex min-h-11 items-center rounded-md border px-3"
      >
        Spieler wechseln
      </a>
    </div>
  </div>
</template>
