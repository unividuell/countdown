import type { Vote } from '@/api/types'

/**
 * Peer review, as the page hands it to a round's card.
 *
 * A framework concept, not one game's: every play on the wire carries `votes`, `struck` and
 * `adminOverride`, and the rule that turns them into a verdict lives in the backend's
 * `PeerReview.kt` for all games alike. Only games that open a review render anything for it.
 *
 * Callbacks rather than events, so whoever draws a ballot can await the round coming back and keep
 * its own control disabled until it does — the same shape `RoundCard` already uses for `submit`.
 * Both resolve with the round replaced; neither rejects.
 */
export interface RoundReview {
  /** Whether this viewer may set the game master's override. The server decides, never the client. */
  canOverride: boolean
  /** `null` withdraws the ballot — one verb for casting, changing and taking back. */
  vote: (userId: string, value: Vote | null) => Promise<void>
  /** `null` hands the decision back to the vote. */
  override: (userId: string, value: boolean | null) => Promise<void>
}
