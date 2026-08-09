<script setup lang="ts">
/**
 * The lab's controls, shaped to live inside the nav drawer rather than in the content column.
 *
 * That placement is the point: during a game review the *look* of the page is under review too,
 * so the content column must hold nothing a real player would not see. The drawer already exists,
 * already sits outside the column, and already opens and closes — so the controls move there
 * instead of growing a second overlay of their own.
 *
 * The geometry copies NavDrawer's own row (h-11, px-5, text-sm) on purpose: these rows sit among
 * the drawer's rows and would read as a foreign object at any other height or inset.
 */
import { ref, watch } from 'vue'
import IconArrowUp from '~icons/lucide/arrow-up'
import IconCommand from '~icons/lucide/command'
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

/** Null means the field does not hold a usable seed; saying so beats silently doing nothing. */
const invalid = ref(false)

function apply(): void {
  const parsed = parseSeed(draft.value)
  invalid.value = parsed === null
  if (parsed !== null) emit('apply', parsed)
}

const ROW = 'flex h-11 w-full shrink-0 items-center px-5 text-left text-sm'
const ACTION = `${ROW} cursor-pointer hover:bg-neutral-100 disabled:cursor-default disabled:opacity-40`
</script>

<template>
  <div class="mt-1.5 border-t border-neutral-200" />
  <div
    data-test="lab-heading"
    class="px-5 pt-3 pb-1 text-xs font-semibold tracking-wide text-neutral-400 uppercase"
  >
    Spiel-Labor
  </div>

  <form class="flex items-center gap-2 px-5 py-1.5" @submit.prevent="apply">
    <label class="sr-only" for="lab-seed">Seed</label>
    <input
      id="lab-seed"
      v-model="draft"
      data-test="lab-seed"
      inputmode="numeric"
      :aria-invalid="invalid || undefined"
      class="h-11 w-full min-w-0 rounded-md border px-2 font-mono text-sm"
      :class="invalid ? 'border-red-500' : 'border-neutral-300'"
      @input="invalid = false"
    />
    <button type="submit" class="h-11 shrink-0 cursor-pointer rounded-md border px-2 text-sm">
      Setzen
    </button>
    <button
      type="button"
      data-test="lab-roll"
      class="h-11 shrink-0 cursor-pointer rounded-md border px-2 text-sm"
      @click="emit('roll')"
    >
      Würfeln
    </button>
  </form>
  <p v-if="invalid" data-test="lab-seed-invalid" class="px-5 pb-1 text-xs text-red-600">
    Kein gültiger Seed — eine ganze Zahl von −2147483648 bis 2147483647.
  </p>

  <button
    type="button"
    data-test="lab-refresh"
    :disabled="props.busy"
    :class="ACTION"
    @click="emit('refresh')"
  >
    Aktualisieren
  </button>
  <button
    type="button"
    data-test="lab-reset"
    :disabled="props.busy"
    :class="ACTION"
    @click="emit('reset')"
  >
    Runde zurücksetzen
    <span
      aria-hidden="true"
      class="ml-auto flex items-center gap-0.5 font-mono text-xs text-neutral-400"
    >
      <IconCommand class="size-3" />
      <IconArrowUp class="size-3" />
      <kbd class="rounded border border-neutral-300 px-1 py-0.5 font-sans text-[10px]">X</kbd>
    </span>
  </button>
  <button
    type="button"
    data-test="lab-forget-mine"
    :disabled="props.busy"
    :class="ACTION"
    @click="emit('forgetMine')"
  >
    Meinen Guess löschen
    <span
      aria-hidden="true"
      class="ml-auto flex items-center gap-0.5 font-mono text-xs text-neutral-400"
    >
      <IconCommand class="size-3" />
      <IconArrowUp class="size-3" />
      <kbd class="rounded border border-neutral-300 px-1 py-0.5 font-sans text-[10px]">Z</kbd>
    </span>
  </button>
  <!-- Full page load, not router navigation: the picker is server-rendered HTML, and the redirect
       brings us back to this exact seed so a player switch does not cost the round. -->
  <a
    data-test="lab-switch-player"
    :href="`/login/github?redirect=${encodeURIComponent(props.returnPath)}`"
    :class="`${ROW} cursor-pointer hover:bg-neutral-100`"
  >
    Spieler wechseln
  </a>
</template>
