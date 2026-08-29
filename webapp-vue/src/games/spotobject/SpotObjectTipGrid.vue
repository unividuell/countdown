<script setup lang="ts">
/**
 * The two-column review grid: every tip of the round, and the whole review, at a glance.
 * Deliberately not part of the scoreboard below it — see `SpotObjectReveal.vue` for why.
 *
 * The ballot is cast here rather than on a page of its own: judging a round means comparing tips,
 * and a detour through one tip's URL and back put the rest of the round off screen for the length
 * of every single vote.
 */
import { ref } from 'vue'
import type { Vote } from '@/api/types'
import type { RoundReview } from '@/rounds/review'
import IconCheck from '~icons/lucide/check'
import IconEye from '~icons/lucide/eye'
import IconFlag from '~icons/lucide/flag'
import IconShieldBan from '~icons/lucide/shield-ban'
import IconShieldCheck from '~icons/lucide/shield-check'
import { googleUrl, shotUrl } from './types'
import type { TipTile } from './tips'

const props = defineProps<{
  tiles: TipTile[]
  /** Whether this viewer played the round at all — whoever did not play does not judge it. */
  canVote: boolean
  review: RoundReview
}>()

/**
 * One ballot at a time, across the whole grid rather than per tile: every one of these rewrites
 * the round's scoring for everybody, so the answer to the first click is what the second one has
 * to be based on.
 */
const busy = ref(false)

async function send(action: () => Promise<void>): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    await action()
  } finally {
    busy.value = false
  }
}

/** A second press on the ballot already held withdraws it — voting is idempotent, not additive. */
function toggleVote(tile: TipTile, value: Vote): void {
  void send(() => props.review.vote(tile.userId, tile.myVote === value ? null : value))
}

/** Same for the override: pressing the verdict that already stands hands the tip back to the vote. */
function toggleOverride(tile: TipTile, value: boolean): void {
  void send(() => props.review.override(tile.userId, tile.adminOverride === value ? null : value))
}
</script>

<template>
  <div data-test="tip-grid" class="grid grid-cols-2 gap-3">
    <div
      v-for="tile in props.tiles"
      :key="tile.userId"
      data-test="tip-tile"
      class="overflow-hidden rounded-lg bg-neutral-100 text-left"
    >
      <!--
        Portrait, and the still is *requested* in the ratio it is shown in: Google's watermark is
        burnt into the bottom-left of the image, so a frame of one ratio filled with an image of
        another crops the attribution away. Portrait because that is the shape the tip was taken
        in — a phone holding a panorama is tall, and a landscape crop of it throws away the half
        the player was actually looking at.
      -->
      <div class="relative aspect-[3/4] bg-neutral-200">
        <img
          v-if="tile.tip"
          :src="shotUrl(tile.tip, 480, 640)"
          loading="lazy"
          alt=""
          class="h-full w-full object-cover"
        />
        <p v-else class="flex h-full items-center justify-center text-xs text-neutral-500">
          aufgegeben
        </p>

        <!--
          Low on the left, but NOT in the corner: the corner is where Google burns its own wordmark
          into every still, and covering it breaks the terms of service. `bottom-6` clears that band
          on any tile this grid can be shown at, which is as close to the corner as the corner
          allows.
        -->
        <a
          v-if="tile.tip"
          data-test="tip-google"
          :href="googleUrl(tile.tip)"
          target="_blank"
          rel="noopener"
          :aria-label="`${tile.name}: in Google Maps ansehen`"
          class="absolute bottom-6 left-2 flex h-11 w-11 items-center justify-center rounded-full bg-white text-neutral-700 shadow"
        >
          <IconEye aria-hidden="true" class="h-5 w-5" />
        </a>

        <!--
          Both control groups sit along the top, never the bottom: the whole bottom band of a
          Street View still is Google's, and covering the watermark breaks the terms of service.
          They take opposite corners because they are two different authorities — the round's
          players on the right, the game master on the left — and a row of four look-alike buttons
          would invite pressing the wrong one.

          Stacked, not side by side: two columns of a phone leave a tile about 165px wide, and four
          44px controls in one row do not fit — they overlapped, and the confirm button vanished
          under the override. Down the two edges each side needs one button's width at any tile
          size this grid is ever shown at.
        -->
        <div
          v-if="props.canVote && !tile.mine && tile.tip"
          data-test="tip-vote"
          class="absolute top-2 right-2 flex flex-col gap-2"
        >
          <button
            type="button"
            data-test="tip-confirm"
            :aria-pressed="tile.myVote === 'CONFIRM'"
            :aria-label="`${tile.name}: bestätigen`"
            class="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full shadow disabled:cursor-default disabled:opacity-40"
            :class="
              tile.myVote === 'CONFIRM' ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-700'
            "
            :disabled="busy"
            @click="toggleVote(tile, 'CONFIRM')"
          >
            <IconCheck aria-hidden="true" class="h-5 w-5" />
          </button>
          <button
            type="button"
            data-test="tip-flag"
            :aria-pressed="tile.myVote === 'FLAG'"
            :aria-label="`${tile.name}: flaggen`"
            class="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full shadow disabled:cursor-default disabled:opacity-40"
            :class="tile.myVote === 'FLAG' ? 'bg-red-600 text-white' : 'bg-white text-red-700'"
            :disabled="busy"
            @click="toggleVote(tile, 'FLAG')"
          >
            <IconFlag aria-hidden="true" class="h-5 w-5" />
          </button>
        </div>

        <div
          v-if="props.review.canOverride && tile.tip"
          data-test="tip-override"
          class="absolute top-2 left-2 flex flex-col gap-2"
        >
          <button
            type="button"
            data-test="tip-override-count"
            :aria-pressed="tile.adminOverride === true"
            :aria-label="`${tile.name}: zählen lassen`"
            class="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full shadow disabled:cursor-default disabled:opacity-40"
            :class="
              tile.adminOverride === true
                ? 'bg-neutral-900 text-white'
                : 'bg-white text-neutral-700'
            "
            :disabled="busy"
            @click="toggleOverride(tile, true)"
          >
            <IconShieldCheck aria-hidden="true" class="h-5 w-5" />
          </button>
          <button
            type="button"
            data-test="tip-override-strike"
            :aria-pressed="tile.adminOverride === false"
            :aria-label="`${tile.name}: streichen`"
            class="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full shadow disabled:cursor-default disabled:opacity-40"
            :class="
              tile.adminOverride === false
                ? 'bg-neutral-900 text-white'
                : 'bg-white text-neutral-700'
            "
            :disabled="busy"
            @click="toggleOverride(tile, false)"
          >
            <IconShieldBan aria-hidden="true" class="h-5 w-5" />
          </button>
        </div>

        <!--
          The same two icons as a plain badge for everyone who cannot press them. The override is
          the one movement in an otherwise fully open procedure, so it may never be silent — and
          the icon says it without a sentence, which is what the struck-through name does too.
        -->
        <div
          v-else-if="tile.adminOverride !== null"
          data-test="tip-override-badge"
          class="absolute top-2 left-2 flex h-11 w-11 items-center justify-center rounded-full bg-white text-neutral-700 shadow"
          :aria-label="
            tile.adminOverride ? 'vom Spielleiter aufgehoben' : 'vom Spielleiter gestrichen'
          "
        >
          <IconShieldCheck v-if="tile.adminOverride" aria-hidden="true" class="h-5 w-5" />
          <IconShieldBan v-else aria-hidden="true" class="h-5 w-5" />
        </div>
      </div>

      <div class="p-2 text-sm">
        <!-- A struck tip says so by striking the name through. No sentence beside it: the line is
             already the sentence, and it stays readable at a glance across a grid of them. -->
        <p
          data-test="tip-name"
          class="truncate px-1 font-medium"
          :class="{ 'line-through': tile.struck }"
          :style="{ backgroundColor: tile.colorHex, color: tile.ink }"
        >
          <span v-if="tile.flag">{{ tile.flag }}</span> {{ tile.name }}
        </p>

        <!-- The voters by name, which is the whole brake on casual flagging: a ballot here is
             never anonymous. -->
        <p v-if="tile.confirms.length > 0" class="truncate text-xs text-neutral-600">
          ✓ {{ tile.confirms.map((vote) => vote.username).join(', ') }}
        </p>
        <p v-if="tile.flags.length > 0" class="truncate text-xs text-neutral-600">
          ⚑ {{ tile.flags.map((vote) => vote.username).join(', ') }}
        </p>
      </div>
    </div>
  </div>
</template>
