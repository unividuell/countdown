<script setup lang="ts">
/**
 * The two-column review grid: every tip of the round, and the whole review, at a glance.
 * Deliberately not part of the scoreboard below it — see `SpotObjectReveal.vue` for why.
 *
 * The ballot is cast here rather than on a page of its own: judging a round means comparing tips,
 * and a detour through one tip's URL and back put the rest of the round off screen for the length
 * of every single vote.
 */
import { computed, ref } from 'vue'
import type { Vote } from '@/api/types'
import type { RoundReview } from '@/rounds/review'
import IconEye from '~icons/lucide/eye'
import IconShieldBan from '~icons/lucide/shield-ban'
import IconShieldCheck from '~icons/lucide/shield-check'
import IconThumbsDown from '~icons/lucide/thumbs-down'
import IconThumbsUp from '~icons/lucide/thumbs-up'
import { googleUrl, shotUrl } from './types'
import type { TipTile } from './tips'

const props = defineProps<{
  tiles: TipTile[]
  /** Whether this viewer played the round at all — whoever did not play does not judge it. */
  canVote: boolean
  review: RoundReview
}>()

/**
 * A closed round shows its review and takes no more of it — the server's window is the running
 * round and the one before it. Both authorities are gated on it here, once, rather than at the two
 * places that render a control.
 */
const canVote = computed(() => props.canVote && props.review.open)
const canOverride = computed(() => props.review.canOverride && props.review.open)

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
  <div data-test="tip-grid" class="grid grid-cols-2 gap-1.5">
    <div
      v-for="tile in props.tiles"
      :key="tile.userId"
      data-test="tip-tile"
      class="flex h-full flex-col overflow-hidden rounded-lg bg-neutral-100 text-left"
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
          into every still, and covering it breaks the terms of service. Measured on a 480×640
          still, that band is the bottom 19px — 3% of the height — so `6%` clears it with the same
          margin again at every tile size, which a pixel value would have to be re-guessed for.
        -->
        <a
          v-if="tile.tip"
          data-test="tip-google"
          :href="googleUrl(tile.tip)"
          target="_blank"
          rel="noopener"
          :aria-label="`${tile.name}: in Google Maps ansehen`"
          class="absolute bottom-[6%] left-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm"
        >
          <IconEye aria-hidden="true" class="h-4 w-4" />
        </a>

        <!--
          Both control groups sit along the top, never the bottom: the whole bottom band of a
          Street View still is Google's, and covering the watermark breaks the terms of service.
          They take opposite corners because they are two different authorities — the round's
          players on the right, the game master on the left — and a row of four look-alike buttons
          would invite pressing the wrong one.

          Stacked, not side by side: two columns of a phone leave a tile about 165px wide, and four
          controls in one row do not fit — they overlapped, and the confirm button vanished under
          the override. Down the two edges each side needs one button's width at any tile size this
          grid is ever shown at.
        -->
        <div
          v-if="canVote && !tile.mine && tile.tip"
          data-test="tip-vote"
          class="absolute top-2 right-2 flex flex-col gap-2"
        >
          <button
            type="button"
            data-test="tip-confirm"
            :aria-pressed="tile.myVote === 'CONFIRM'"
            :aria-label="`${tile.name}: bestätigen`"
            class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full backdrop-blur-sm disabled:cursor-default disabled:opacity-40"
            :class="
              tile.myVote === 'CONFIRM' ? 'bg-emerald-600 text-white' : 'bg-black/30 text-white'
            "
            :disabled="busy"
            @click="toggleVote(tile, 'CONFIRM')"
          >
            <IconThumbsUp aria-hidden="true" class="h-4 w-4" />
          </button>
          <button
            type="button"
            data-test="tip-flag"
            :aria-pressed="tile.myVote === 'FLAG'"
            :aria-label="`${tile.name}: flaggen`"
            class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full backdrop-blur-sm disabled:cursor-default disabled:opacity-40"
            :class="tile.myVote === 'FLAG' ? 'bg-red-600 text-white' : 'bg-black/30 text-white'"
            :disabled="busy"
            @click="toggleVote(tile, 'FLAG')"
          >
            <IconThumbsDown aria-hidden="true" class="h-4 w-4" />
          </button>
        </div>

        <div
          v-if="canOverride && tile.tip"
          data-test="tip-override"
          class="absolute top-2 left-2 flex flex-col gap-2"
        >
          <button
            type="button"
            data-test="tip-override-count"
            :aria-pressed="tile.adminOverride === true"
            :aria-label="`${tile.name}: zählen lassen`"
            class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full backdrop-blur-sm disabled:cursor-default disabled:opacity-40"
            :class="
              tile.adminOverride === true ? 'bg-neutral-900 text-white' : 'bg-black/30 text-white'
            "
            :disabled="busy"
            @click="toggleOverride(tile, true)"
          >
            <IconShieldCheck aria-hidden="true" class="h-4 w-4" />
          </button>
          <button
            type="button"
            data-test="tip-override-strike"
            :aria-pressed="tile.adminOverride === false"
            :aria-label="`${tile.name}: streichen`"
            class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full backdrop-blur-sm disabled:cursor-default disabled:opacity-40"
            :class="
              tile.adminOverride === false ? 'bg-neutral-900 text-white' : 'bg-black/30 text-white'
            "
            :disabled="busy"
            @click="toggleOverride(tile, false)"
          >
            <IconShieldBan aria-hidden="true" class="h-4 w-4" />
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
          class="absolute top-2 left-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm"
          :aria-label="
            tile.adminOverride ? 'vom Spielleiter aufgehoben' : 'vom Spielleiter gestrichen'
          "
        >
          <IconShieldCheck v-if="tile.adminOverride" aria-hidden="true" class="h-4 w-4" />
          <IconShieldBan v-else aria-hidden="true" class="h-4 w-4" />
        </div>
      </div>

      <!-- Two blocks, each edge to edge: whose tip this is, and what the round said about it.
           The player's colour carries only the name — running it under the votes too made one
           coloured slab whose height depended on how many people had voted, which is not what the
           colour is for. Below it the neutral ground takes the rest of the tile, so a neighbour
           with more voters no longer leaves a pale gap under the shorter one.

           Two columns inside each block, one grid each: marker and text, so the flag and every
           thumb below it share one edge and the names share the other. Per-line flexboxes each
           pick their own marker width and nothing lines up. -->
      <div data-test="tip-foot" class="flex flex-1 flex-col text-sm">
        <div
          data-test="tip-owner"
          class="grid grid-cols-[auto_1fr] items-center gap-x-2 px-2 py-1.5"
          :style="{ backgroundColor: tile.colorHex, color: tile.ink }"
        >
          <!-- The flag in a chip of its own: on a saturated player colour a bare emoji sits in the
               background instead of on it. Barely rounded, tight padding — it is a marker beside
               the name, not a second name. Outside the strike-through, which is about the tip, not
               the country. -->
          <span
            v-if="tile.flag"
            data-test="tip-country"
            class="justify-self-center rounded-sm bg-neutral-100 px-1 leading-5"
            >{{ tile.flag }}</span
          >
          <span v-else />
          <!-- A struck tip says so by striking the name through. No sentence beside it: the line is
               already the sentence, and it stays readable at a glance across a grid of them. -->
          <span
            data-test="tip-name"
            class="truncate font-medium"
            :class="{ 'line-through': tile.struck }"
            >{{ tile.name }}</span
          >
        </div>

        <!-- The voters by name, which is the whole brake on casual flagging: a ballot here is
             never anonymous. One row each rather than a comma list — a tile is half a phone wide,
             so the list truncated at the second name and the rest of the review simply vanished.
             The same two icons the buttons above carry, so a name here reads as the ballot it was.
             An override does not remove the names it beat either; it strikes them through, so what
             the round decided stays readable beside the verdict that overruled it. -->
        <div
          data-test="tip-votes"
          class="grid flex-1 grid-cols-[auto_1fr] content-start items-center gap-x-2 gap-y-0.5 bg-neutral-100 px-2 pt-2.5 pb-2 text-neutral-700"
        >
          <template v-for="vote in tile.confirms" :key="`c-${vote.userId}`">
            <IconThumbsUp aria-hidden="true" class="size-3.5 justify-self-center" />
            <span
              data-test="tip-confirms"
              class="truncate text-xs"
              :class="{ 'line-through': tile.adminOverride === false }"
              >{{ vote.username }}</span
            >
          </template>
          <template v-for="vote in tile.flags" :key="`f-${vote.userId}`">
            <IconThumbsDown aria-hidden="true" class="size-3.5 justify-self-center" />
            <span
              data-test="tip-flags"
              class="truncate text-xs"
              :class="{ 'line-through': tile.adminOverride === true }"
              >{{ vote.username }}</span
            >
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
