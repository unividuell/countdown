package org.unividuell.countdown.core.game

/**
 * One ballot with two sides, not two counters. A row per (tip, voter) makes „confirmed and flagged
 * at once" structurally impossible and gives a way back out of a misclick.
 */
enum class Vote { CONFIRM, FLAG }

/** The two counts of one tip's ballots. */
data class VoteTally(val confirms: Int, val flags: Int) {

    companion object {
        val NONE = VoteTally(confirms = 0, flags = 0)

        fun of(values: Collection<Vote>): VoteTally = VoteTally(
            confirms = values.count { it == Vote.CONFIRM },
            flags = values.count { it == Vote.FLAG },
        )
    }
}

/**
 * The whole rule, in one expression: `flags >= 2 && flags > confirms`.
 *
 * Without confirmations the two-vote threshold holds — one player alone cannot shoot anybody down,
 * two friends are signal enough. Once anybody confirms, the majority of cast votes has to stand
 * against the tip. A struck tip comes back if later confirmations turn it.
 */
fun struckOut(tally: VoteTally): Boolean = tally.flags >= 2 && tally.flags > tally.confirms

/**
 * What the framework's arithmetic should treat this play as — the input `RoundScoring` builds its
 * [Verdict] from.
 *
 * Exposed and pure for the same reason `pointsFor` and `guessActionFor` are: the lab replays the
 * exact rule the real round applies, rather than owning a second copy that can drift.
 *
 * The override is a stored *input*, not a written score: nobody edits points by hand, and the
 * re-evaluation stays a pure function of persisted values.
 */
fun effectiveQualifies(adminOverride: Boolean?, qualifies: Boolean, tally: VoteTally): Boolean =
    adminOverride ?: (qualifies && !struckOut(tally))

/**
 * Whether the **review** is what this play lost its points to — the label both worlds publish as
 * `struck`, and deliberately narrower than `!effectiveQualifies(...)`.
 *
 * A give-up, and a wrong guess in a game that never opened a review at all, score nothing on their
 * own; calling those „struck" would tell the round that the other players struck a tip nobody ever
 * voted on. Two ways in, and only two: the game qualified the play and the ballots turned it, or
 * the game master struck it outright.
 */
fun struckByReview(adminOverride: Boolean?, qualifies: Boolean, tally: VoteTally): Boolean =
    adminOverride == false ||
        (qualifies && !effectiveQualifies(adminOverride = adminOverride, qualifies = true, tally = tally))
