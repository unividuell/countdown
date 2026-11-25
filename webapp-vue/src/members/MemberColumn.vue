<script setup lang="ts">
/**
 * One member as the roster draws them: avatar with streak badge, standing points, this round's
 * live chip. Shared by the row and the pop that shows my flare away from it.
 */
import StreakMark from './StreakMark.vue'
import Avatar from '@/ui/Avatar.vue'
import type { RosterMemberResponse } from '@/api/types'

defineProps<{
  member: RosterMemberResponse
  /** The streak the badge shows, which the row may hold back from `member.streak`. */
  streak: number
}>()

/** Empty for a member who has not played: the chip stays in the flow, holding the row's height. */
function liveLabel(m: RosterMemberResponse): string {
  const live = m.points.live
  if (live === undefined) return ''
  // A nought beside the stable badge's nought read as one two-digit number; the skull says „played,
  // came away empty“ without competing with a number. The screen-reader wording lives in
  // `MemberRow`'s `liveSuffix`, so the emoji never has to carry it.
  return live.points > 0 ? `+${live.points}` : '💀'
}

/**
 * Whether the number can still move is the server's answer (`provisional`), not a re-derivation from
 * the award rule here.
 *
 * One colour per meaning, so the state is never carried by punctuation: yellow is the standing total,
 * dark is „this round is done“, rose and pulsing is „still up for grabs“. A settled chip in the
 * badge's own yellow was the obvious reading of „same colour as stable“ and the wrong one — stacked
 * under one avatar, `5` above `+6` reads as one two-line number, with a 12px plus sign as the only
 * thing telling them apart.
 */
function liveChipClass(m: RosterMemberResponse): string {
  const live = m.points.live
  if (live === undefined) return 'invisible'
  return live.provisional
    ? 'animate-pulse bg-live text-on-live ring-yellow-400 motion-reduce:animate-none'
    : 'bg-inverse-surface text-inverse-on-surface ring-surface'
}
</script>

<template>
  <div class="flex w-12 shrink-0 flex-col">
    <!-- The badge sits in the circle the swarm moves, so it flies and reorders with it. -->
    <div class="relative" data-swarm-circle>
      <Avatar :short-name="member.shortName" :bg-color-hex="member.bgColorHex" />
      <StreakMark :streak="streak" />
    </div>
    <!-- `z-10`: the positioned circle above would otherwise paint over the badge it overlaps. -->
    <div
      class="z-10 -mt-1.5 h-4 w-6 place-self-center overflow-hidden rounded-lg bg-yellow-400 text-center text-xs whitespace-nowrap text-neutral-950 ring-1 ring-surface"
    >
      {{ member.points.stable }}
    </div>
    <!-- Always in the flow, only ever hidden: a chip that comes and goes takes the row's height
         with it, and the section around it centres what is left — which is the vertical jump the
         ranking made the moment the first live points landed. `h-4` is what `text-xs` gives the
         chip anyway, written down so an empty one keeps it. -->
    <span
      data-test="live-points"
      class="z-20 -mt-1.5 h-4 self-end rounded-lg px-1 text-xs whitespace-nowrap ring-1"
      :class="liveChipClass(member)"
      >{{ liveLabel(member) }}</span
    >
  </div>
</template>
