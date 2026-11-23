import type { AvatarView, RosterMemberResponse } from '@/api/types'
import { hash32 } from '@/gamelab/seed'
import type { LabEntryDto, LabRoundResponse } from '@/gamelab/types'

/** The tester at the screen — enough of `MeResponse` to seat them in the row. */
export interface LabViewer {
  id: string
  username: string
  avatar: AvatarView
}

/**
 * Where a streak starts: mostly one step below a band edge, so the lab's own round can tip the
 * badge over it and show the flare and the triangle.
 */
const BASES = [2, 9, 19, 32, 49, 5, 14, 25, 40]

/**
 * A member's streak before this round's entry, rolled from the URL's seed — the lab has no history,
 * and a shared link must show the same badges. Independent of who looks: two testers on one seed
 * see each other's badge as each sees their own.
 */
export function labStreakBase(seed: number, userId: string): number {
  return BASES[hash32(`${seed}:${userId}`) % BASES.length]!
}

/**
 * The lab round's entries in the shape the product's `MemberRow` already takes, so the lab can
 * show the real row without the row knowing the lab exists.
 *
 * Two server rules are mirrored here, each a one-liner, because the lab has no roster endpoint:
 * the order (`RosterService.rank`: displayed points, highest first) and „can still move“
 * (`RoundPlayPoints`: a scoring tip under `CLOSEST_ONLY`). If either drifts, the lab shows a wrong
 * order — the product is untouched.
 *
 *   entries ──► one member each, stable 0, live = the round's points
 *   players ──► seated without live points while their entries are withheld (before my guess)
 *   viewer  ──► seated without live points until their own entry lands
 *
 *   seed ──► labStreakBase ──► streak before this round
 *   entry ──► +1 (a seat without an entry keeps the base)
 */
export function labRoster(
  round: Pick<LabRoundResponse, 'seed' | 'me' | 'others' | 'awardRule' | 'players'>,
  viewer: LabViewer | null,
): RosterMemberResponse[] {
  const streak = (userId: string, entered: boolean) =>
    labStreakBase(round.seed, userId) + (entered ? 1 : 0)

  const fromEntry = (e: LabEntryDto): RosterMemberResponse => ({
    userId: e.userId,
    shortName: e.avatar.shortName,
    fullName: e.username,
    bgColorHex: e.avatar.bgColorHex,
    points: {
      stable: 0,
      live: { points: e.points, provisional: round.awardRule === 'CLOSEST_ONLY' && e.points > 0 },
    },
    streak: streak(e.userId, true),
  })

  const members = round.others.map(fromEntry)

  // Named but withheld: seated like a member who has not played, so no chip hints at their tip.
  const seated = new Set(members.map((m) => m.userId))
  for (const p of round.players ?? []) {
    if (seated.has(p.userId)) continue
    members.push({
      userId: p.userId,
      shortName: p.avatar.shortName,
      fullName: p.username,
      bgColorHex: p.avatar.bgColorHex,
      points: { stable: 0 },
      streak: streak(p.userId, false),
    })
  }

  // The viewer's own row: their entry once they guessed, otherwise a seat without a chip.
  if (round.me) members.push(fromEntry(round.me))
  else if (viewer)
    members.push({
      userId: viewer.id,
      shortName: viewer.avatar.shortName,
      fullName: viewer.username,
      bgColorHex: viewer.avatar.bgColorHex,
      points: { stable: 0 },
      streak: streak(viewer.id, false),
    })

  const rank = (m: RosterMemberResponse) => m.points.stable + (m.points.live?.points ?? 0)
  return members.sort((a, b) => rank(b) - rank(a) || a.userId.localeCompare(b.userId))
}
