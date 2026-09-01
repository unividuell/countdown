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
  /**
   * Whether this round still takes ballots at all. The server's window is „the running round or
   * the one immediately before it“ and it refuses anything older — without this the grid offered
   * controls for a round nobody could vote on any more, and every press came back a 404.
   *
   * Known by whoever loaded the round: the running round is open, and in the history only the
   * entry point — `previousRoundNumber` — is.
   */
  open: boolean
  /** Whether this viewer may set the game master's override. The server decides, never the client. */
  canOverride: boolean
  /** `null` withdraws the ballot — one verb for casting, changing and taking back. */
  vote: (userId: string, value: Vote | null) => Promise<void>
  /** `null` hands the decision back to the vote. */
  override: (userId: string, value: boolean | null) => Promise<void>
}
