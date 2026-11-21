/**
 * Whether my tip earns the reveal's success sound — one rule for every game. With a gate (phase
 * one): my tip inside it. Without (phase two): my row holds the points now — under „closest only“
 * that is being ahead, vorläufig. `null` without a tip of mine or a verdict on it: no sound.
 */
export function myWin(input: {
  /** Whether this round has a gate: phase one. */
  gated: boolean
  /** What my outcome says about the gate; `null` where it says nothing. */
  withinGate: boolean | null
  rows: readonly { userId: string; points: number | null }[]
  mineUserId: string | null
}): boolean | null {
  if (input.gated) return input.withinGate

  const points = input.rows.find((row) => row.userId === input.mineUserId)?.points ?? null

  return points === null ? null : points > 0
}
