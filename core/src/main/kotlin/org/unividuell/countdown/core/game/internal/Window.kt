package org.unividuell.countdown.core.game.internal

import org.unividuell.countdown.core.community.CommunityEdition

/**
 * Where a round falls relative to a run's game window — inclusive on both ends:
 * `gamesUntilRound <= roundNumber <= gamesFromRound`. `null` means inside the window;
 * [NoGameReason.BEFORE_WINDOW] and [NoGameReason.AFTER_WINDOW] say which side it fell off.
 *
 * `gamesFromRound == null` means unbounded above — there is no "before" for that edition.
 *
 * A pure function rather than an inline comparison in [AnnouncementService] so the boundary can be
 * unit-tested directly: the existing suite only ever calls it with round numbers thousands away from
 * either edge, which would not notice `>` silently becoming `>=`.
 *
 * Deliberately **not** in the exposed `Awards.kt` next to `Phase` and `awardFor`, although all three
 * are round arithmetic: this one answers with a [NoGameReason], which is a wire enum of the
 * announcement, and the lab has no window at all. Exposing it would publish a DTO for a consumer
 * that does not exist.
 */
fun windowReasonOf(roundNumber: Int, gamesFromRound: Int?, gamesUntilRound: Int): NoGameReason? {
    if (gamesFromRound != null && roundNumber > gamesFromRound) return NoGameReason.BEFORE_WINDOW
    if (roundNumber < gamesUntilRound) return NoGameReason.AFTER_WINDOW
    return null
}

/**
 * Same check against a run: the announcement and the standings must not be able to disagree about
 * which rounds are in play — a round outside the window carries no game *and* counts for nothing.
 */
fun windowReasonOf(edition: CommunityEdition, roundNumber: Int): NoGameReason? = windowReasonOf(
    roundNumber = roundNumber,
    gamesFromRound = edition.gamesFromRound,
    gamesUntilRound = edition.gamesUntilRound,
)
