package org.unividuell.countdown.core.game.internal

import org.unividuell.countdown.core.community.CommunityEdition

enum class Phase { ONE, TWO;

    companion object {
        /** Later in time means a smaller round number, so phase two is `roundNumber <= threshold`. */
        fun of(roundNumber: Int, phaseTwoStartRound: Int?): Phase =
            if (phaseTwoStartRound != null && roundNumber <= phaseTwoStartRound) TWO else ONE

        fun of(edition: CommunityEdition, roundNumber: Int): Phase =
            of(roundNumber = roundNumber, phaseTwoStartRound = edition.phaseTwoStartRound)
    }
}

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
 */
fun windowReasonOf(roundNumber: Int, gamesFromRound: Int?, gamesUntilRound: Int): NoGameReason? {
    if (gamesFromRound != null && roundNumber > gamesFromRound) return NoGameReason.BEFORE_WINDOW
    if (roundNumber < gamesUntilRound) return NoGameReason.AFTER_WINDOW
    return null
}

enum class AwardRule {
    /** Every qualifying guess scores. */
    ALL_QUALIFYING,

    /** In the original „winner takes it all“ — `winnerTakesItAll` / `winnerTakesItAllCleaner`. */
    CLOSEST_ONLY,
}

data class Award(val rule: AwardRule, val points: Int)

/**
 * Rule *and* stake from one function, so a raised tolerance and a raised stake cannot drift apart.
 * The result is frozen onto the round, which is what lets the numbers change later without costing
 * history.
 */
fun awardFor(roundNumber: Int, phaseTwoStartRound: Int?): Award =
    when (Phase.of(roundNumber = roundNumber, phaseTwoStartRound = phaseTwoStartRound)) {
        Phase.ONE -> Award(rule = AwardRule.ALL_QUALIFYING, points = 1)
        // „Schlag den Raab“: from the threshold on the stake grows by one per round.
        // Over Gauß summable — what is still up for grabs from here on.
        Phase.TWO -> Award(
            rule = AwardRule.CLOSEST_ONLY,
            points = requireNotNull(phaseTwoStartRound) - roundNumber + 2,
        )
    }
