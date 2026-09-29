<script setup lang="ts">
/**
 * The cover over a sealed game's play area: frosted glass over a scene that is already set up, and
 * the hold that opens it. The game lays it over its own play area and nothing else, so the rules
 * and the stake below stay readable; it also sets `inert` on that play area, because glass stops a
 * finger but not a keyboard or a screen reader.
 *
 * The sentence is framework copy, not a game's: sealing means the same thing for every game that
 * does it — the clock starts at the reveal, and there is no second attempt.
 */
import { nextTick, ref, useTemplateRef, watch } from 'vue'
import HoldButton from '@/ui/HoldButton.vue'
import type { SceneState } from '@/ui/sceneState'

const props = defineProps<{
  state: SceneState
  /** The reveal is on its way — the card's `busy`, reaching the game as `disabled`. */
  busy: boolean
}>()

const emit = defineEmits<{ start: []; retry: [] }>()

const cover = useTemplateRef<HTMLDivElement>('cover')

/**
 * A completed hold leaves the ring full. When the reveal behind it fails, a full ring would claim
 * something runs that does not, so the button is remounted fresh; a remount with `ready` already
 * true does not replay the entrance, which only fires on a change of `ready`.
 *
 * The remount tears down the focused button along with it, so a keyboard user loses focus to
 * whatever the browser falls back to. Caught here rather than left to the browser: if focus was
 * inside the cover before the swap, put it back on the fresh button once the DOM has the new one.
 */
const attempt = ref(0)
watch(
  () => props.busy,
  async (now, before) => {
    if (!before || now) return
    const hadFocus = !!cover.value?.contains(document.activeElement)
    attempt.value++
    if (!hadFocus) return
    await nextTick()
    cover.value?.querySelector<HTMLButtonElement>('[data-test="hold-button"]')?.focus()
  },
)
</script>

<template>
  <div
    ref="cover"
    data-test="reveal-cover"
    class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-white/40 p-6 text-center backdrop-blur-md"
  >
    <p data-test="reveal-cover-cost" class="max-w-xs text-sm text-neutral-800">
      Deine Zeit läuft ab dem Aufdecken — und du hast nur <strong>einen</strong> Versuch.
    </p>
    <p
      v-if="state === 'preparing'"
      data-test="reveal-cover-preparing"
      class="text-sm text-neutral-600"
    >
      Wird vorbereitet …
    </p>
    <template v-else-if="state === 'failed'">
      <p data-test="reveal-cover-failed" class="text-sm text-neutral-800">
        Das Spiel konnte nicht geladen werden.
      </p>
      <button
        type="button"
        data-test="reveal-cover-retry"
        class="h-11 cursor-pointer rounded-md bg-neutral-900 px-6 text-sm font-medium text-white"
        @click="emit('retry')"
      >
        Nochmal versuchen
      </button>
    </template>
    <!-- Mounted in every state, so its entrance fires the moment `ready` flips. -->
    <div class="size-24 shrink-0" :class="{ 'animate-pulse motion-reduce:animate-none': busy }">
      <HoldButton
        :key="attempt"
        :ready="state === 'ready'"
        :disabled="busy"
        label="START"
        color="#171717"
        :beats="3"
        @confirm="emit('start')"
      />
    </div>
  </div>
</template>
