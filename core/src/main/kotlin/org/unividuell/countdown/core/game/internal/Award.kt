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
