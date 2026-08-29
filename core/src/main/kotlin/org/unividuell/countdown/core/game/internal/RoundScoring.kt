package org.unividuell.countdown.core.game.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.game.Award
import org.unividuell.countdown.core.game.Verdict
import org.unividuell.countdown.core.game.VoteTally
import org.unividuell.countdown.core.game.effectiveQualifies
import org.unividuell.countdown.core.game.pointsFor

/**
 * Writes the round's points — all of them, every time somebody guesses.
 *
 * The caller must hold the round's row lock (`RoundGameStore.lock`): this reads every guess of the
 * round and writes back over all of them, including other players'. Two concurrent guesses without
 * the lock would each compute from the same stale picture and one update would be lost, precisely in
 * the moment the points move.
 */
@Component
class RoundScoring(
    private val plays: RoundPlayRepository,
    private val votes: RoundPlayVoteRepository,
) {

    private val logger = KotlinLogging.logger {}

    /** Returns how many rows changed — `0` means the stored points were already correct. */
    @Transactional
    fun reevaluate(round: RoundGame): Int {
        val roundGameId = requireNotNull(round.id)
        val guessed = plays.findByRoundGameId(roundGameId).filter { it.guessedAt != null }
        // One read for the whole round, grouped here rather than in SQL: `VoteTally.of` is the one
        // place the two counts are derived, and a second derivation is how they would drift.
        val tallies = votes.votesOfRound(roundGameId)
            .groupBy { it.roundPlayId }
            .mapValues { (_, cast) -> VoteTally.of(cast.map { it.value }) }

        val points = pointsFor(
            award = Award(rule = round.awardRule, points = round.awardPoints),
            verdicts = guessed.map { play ->
                val playId = requireNotNull(play.id)
                Verdict(
                    id = playId,
                    // The one line peer review adds: the game's verdict, as the round's own
                    // players (or its game master) have since amended it.
                    qualifies = effectiveQualifies(
                        adminOverride = play.adminOverride,
                        qualifies = play.qualifies == true,
                        tally = tallies[playId] ?: VoteTally.NONE,
                    ),
                    // A guessed row always carries a deviation; treating a missing one as "infinitely
                    // far off" keeps a broken row out of the win rather than crashing the round.
                    deviation = play.deviation ?: Double.MAX_VALUE,
                )
            },
        )

        var written = 0
        for (play in guessed) {
            val playId = requireNotNull(play.id)
            val now = points[playId] ?: 0
            if (play.points == now) continue
            if ((play.points ?: 0) > now) {
                // The one place behaviour degrades silently: somebody's points vanished, and in a
                // support case it would otherwise be their word against ours.
                logger.info {
                    "round ${round.roundNumber}: user ${play.userId} drops from ${play.points} to $now points"
                }
            }
            plays.updatePoints(id = playId, points = now)
            written++
        }
        return written
    }
}
