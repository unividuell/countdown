<script setup lang="ts">
/**
 * The raw wire values of every guess in the round, the viewer's own included. The caller puts it
 * first when there is one; this component only ever lays the list out. Before the viewer has
 * guessed the backend withholds everyone else's, so this list is legitimately empty — rendered as
 * nothing at all, not an empty box with nothing in it.
 *
 * It survives the arrival of a game's own result view (Guess Hue has a scoreboard now) because a
 * new game gets one of those late: until then this is the only place a reviewer sees what the
 * server actually stored.
 *
 * The delete action follows `mineUserId`, never the row's position: a game that reveals others
 * before the viewer has guessed puts a stranger in the first row, and position alone would offer
 * to delete „meinen Guess“ on top of theirs.
 */
import IconRotateCcw from '~icons/lucide/rotate-ccw'
import IconX from '~icons/lucide/x'
import Avatar from '@/ui/Avatar.vue'
import type { LabEntryDto } from './types'

defineProps<{
  entries: LabEntryDto[]
  mineUserId: string | null
  busy?: boolean
}>()
const emit = defineEmits<{
  forgetMine: []
  reset: []
}>()

/**
 * The wire value, with every number cut to one decimal. A hue arrives carrying seventeen digits of
 * float noise that tell a reviewer nothing, and one decimal is what the game's own result view
 * shows beside it — two different roundings of one number on one screen would be worse than
 * either. The replacer returns a number, so the output stays valid JSON.
 */
function shortJson(value: unknown): string {
  return JSON.stringify(value, (_key, raw: unknown) =>
    typeof raw === 'number' ? Math.round(raw * 10) / 10 : raw,
  )
}
</script>

<template>
  <div v-if="entries.length > 0" class="mt-4">
    <ul data-test="lab-entries" class="space-y-2">
      <!-- `relative` for the delete button alone: it hangs on the corner rather than sitting in
           the flow, so the one row that carries it lays out exactly like the rows that do not. -->
      <li
        v-for="entry in entries"
        :key="entry.userId"
        class="relative flex items-center gap-3 rounded-md border border-neutral-200 p-2"
      >
        <!-- The name is the avatar's four characters. The full one stays reachable: `title` for a
             pointer, `sr-only` for everything else — the avatar itself is a bare div with no
             accessible name of its own. -->
        <Avatar
          :short-name="entry.avatar.shortName"
          :bg-color-hex="entry.avatar.bgColorHex"
          size="sm"
          :title="entry.username"
        />
        <span class="sr-only">{{ entry.username }}</span>
        <code class="text-xs break-all text-neutral-500">
          {{ shortJson(entry.guess)
          }}<template v-if="entry.outcome !== null"> → {{ shortJson(entry.outcome) }}</template>
        </code>
        <span data-test="lab-entry-points" class="ml-auto text-xs font-semibold tabular-nums">
          {{ entry.points }}
        </span>

        <!-- The shortcut rides along because this badge is the only place the action is visible
             without opening the drawer. `aria-hidden`, like the drawer's own hints: `aria-label`
             already names the action, and „Klammer auf Befehl Umschalt Z" is not a name.
             `after:-inset-2.5` carries the tap target to 44px without the pill growing to match. -->
        <button
          v-if="entry.userId === mineUserId"
          type="button"
          data-test="lab-entry-forget-mine"
          :disabled="busy"
          aria-label="Meinen Guess löschen"
          class="absolute -top-3.5 -right-3.5 flex cursor-pointer items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-1.5 text-neutral-400 after:absolute after:-inset-2.5 after:content-[''] hover:bg-neutral-100 hover:text-neutral-700 disabled:cursor-default disabled:opacity-40"
          @click="emit('forgetMine')"
        >
          <IconX class="size-3.5" />
          <span aria-hidden="true" class="font-mono text-[10px] leading-none">(⌘⇧Z)</span>
        </button>
      </li>
    </ul>

    <div class="mt-2 flex justify-end">
      <button
        type="button"
        data-test="lab-entries-reset"
        :disabled="busy"
        class="flex h-11 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs text-neutral-500 hover:bg-neutral-100 disabled:cursor-default disabled:opacity-40"
        @click="emit('reset')"
      >
        <IconRotateCcw class="size-3.5" />
        Runde zurücksetzen
        <span aria-hidden="true" class="font-mono text-[10px]">(⌘⇧X)</span>
      </button>
    </div>
  </div>
</template>
