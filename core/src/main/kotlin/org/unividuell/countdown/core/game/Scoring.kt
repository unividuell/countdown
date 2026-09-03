package org.unividuell.countdown.core.game

import java.util.UUID

/**
 * One stored guess, reduced to what an award rule is allowed to see. [id] is the caller's own key —
 * the play row's id in a real round, the tester's user id in the lab — because the arithmetic does
 * not care which.
 */
data class Verdict(val id: UUID, val qualifies: Boolean, val deviation: Double)

/**
 * The points of every guess in a round: a pure function of the round's frozen [award] and the stored
 * verdicts, and **not** of the game — `qualifies` and `deviation` sit on the rows, so this is plain
 * framework arithmetic.
 *
 * That is also why "a later guess takes the points away" needs no mechanism of its own. It is not
 * `points = f(params, guess)` any more but `points = f(award, all verdicts of the round)`, still a
 * pure function of persisted values — so the answer is to evaluate the round again, not to subtract.
 *
 * A tie gets the full amount **twice**, it does not split: with `Double` degrees that is practically
 * unreachable, but a pure right/wrong game reports `0.0` for every hit, and there `CLOSEST_ONLY` then
 * behaves like `ALL_QUALIFYING` without a special case. Comparing `Double`s with `==` is correct
 * here — stored values against the minimum of the same stored values, not two independently computed
 * approximations.
 */
fun pointsFor(award: Award, verdicts: List<Verdict>): Map<UUID, Int> {
    // Hoisted above the `when` rather than computed inside the CLOSEST_ONLY branch: a `val` statement
    // directly followed by a bare lambda literal inside a `when` branch is a genuine Kotlin parser
    // ambiguity (the lambda gets swallowed as a trailing-lambda continuation of the previous line), so
    // each branch below is kept to a single lambda-literal expression.
    val best = verdicts.filter { it.qualifies }.minOfOrNull { it.deviation }
    val scores: (Verdict) -> Boolean = when (award.rule) {
        AwardRule.ALL_QUALIFYING -> { verdict -> verdict.qualifies }
        AwardRule.CLOSEST_ONLY -> {
            verdict -> verdict.qualifies && best != null && verdict.deviation == best
        }
    }
    return verdicts.associate { it.id to if (scores(it)) award.points else 0 }
}
