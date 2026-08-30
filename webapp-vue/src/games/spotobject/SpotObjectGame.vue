<script setup lang="ts">
/**
 * Weltanschauung: which card the round is on, and the one place `unknown` becomes typed.
 *
 * Unlike Musterung this game has no solution to watch for — there is no round secret at all. The
 * switch is the server's own rule for `others`, in both of its halves: `hasGuessed || closed`.
 * While the round runs, my own finished entry opens everyone's tips; once it is closed they are
 * open to everyone, and a closed round must never put a live map on screen again.
 */
import { computed, ref, watch } from 'vue'
import type { AwardRule } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import type { RoundReview } from '@/rounds/review'
import InfoBox from '@/ui/InfoBox.vue'
import SpotObjectBoard from './SpotObjectBoard.vue'
import SpotObjectRules from './SpotObjectRules.vue'
import SpotObjectReveal from './SpotObjectReveal.vue'
import SpotObjectTerm from './SpotObjectTerm.vue'
import { scoreRows, tipTiles } from './tips'
import { isSpotObjectPayload } from './types'

const props = defineProps<{
  payload: unknown
  outcome: unknown
  myGuess: unknown
  solution: unknown
  entries: GameEntry[]
  mineUserId: string | null
  awardRule: AwardRule | null
  disabled: boolean
  stage?: number
  assetUrl?: (key: number) => string
  /** The round is over for everyone — the other half of the server's own rule for `others`. */
  closed?: boolean
  review: RoundReview
}>()

const emit = defineEmits<{ guess: [unknown]; skip: [number]; giveUp: [] }>()

const payload = computed(() => (isSpotObjectPayload(props.payload) ? props.payload : null))

const mine = computed(
  () => props.entries.find((entry) => entry.userId === props.mineUserId) ?? null,
)
const played = computed(() => mine.value !== null && mine.value.guess !== null)
const revealed = computed(() => played.value || props.closed === true)

const tiles = computed(() => tipTiles({ entries: props.entries, mineUserId: props.mineUserId }))
const rows = computed(() =>
  scoreRows({ entries: props.entries, awardRule: props.awardRule, mineUserId: props.mineUserId }),
)

const live = computed(() => props.awardRule === 'CLOSEST_ONLY')

/**
 * Whether the reveal is something that just happened here rather than something that was already
 * true on mount — the same flag every other game's reveal keeps. A `watch` without `immediate`
 * never fires for the initial value, which is what makes an instance mounting already-played
 * start `false` instead of replaying the choreography. Watched on `played`, not on `revealed`:
 * a round closing under someone who never played reveals nothing of theirs.
 */
const hasRevealedLive = ref(false)
watch(played, (now, before) => {
  if (!before && now) hasRevealedLive.value = true
})
</script>

<template>
  <p v-if="payload === null" class="text-sm text-neutral-600">
    Diese Runde lässt sich hier nicht anzeigen.
  </p>
  <!-- `-m-4` cancels RoundSurface's own body padding on every side, so the term band and the map
       below it run edge to edge. The reveal pays the padding back: a grid and a scoreboard want
       the card's gutter, only the two full-bleed things do not. -->
  <div v-else class="-m-4">
    <!-- The same band either way, in the only two places it can be: over the map while somebody
         searches, so the search keeps the whole card, and in the card's own flow at the reveal,
         where there is no map left to lie over. -->
    <div v-if="revealed" class="flex flex-col gap-4 p-4">
      <SpotObjectTerm :term="payload.term" />
      <SpotObjectReveal
        :tiles="tiles"
        :rows="rows"
        :live="live"
        :animate="hasRevealedLive"
        :can-vote="played"
        :review="props.review"
      />
    </div>
    <template v-else>
      <SpotObjectBoard :disabled="props.disabled" @guess="(value) => emit('guess', value)">
        <SpotObjectTerm :term="payload.term" class="mt-3" />
      </SpotObjectBoard>

      <!-- Below the map, the way `FindPatternBoard` puts its own rules below the field: the
           explanation is for whoever wants it, and the board is for everyone. -->
      <div class="p-4">
        <InfoBox storage-key="spot-object">
          <template #abstract>Finde den gesuchten Gegenstand irgendwo auf der Welt.</template>
          <SpotObjectRules />
        </InfoBox>
      </div>
    </template>
  </div>
</template>
