package org.unividuell.countdown.core.game.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

/**
 * Writes the round's points — all of them, every time somebody guesses.
 *
 * The caller must hold the round's row lock (`RoundGameStore.lock`): this reads every guess of the
 * round and writes back over all of them, including other players'. Two concurrent guesses without
 * the lock would each compute from the same stale picture and one update would be lost, precisely in
 * the moment the points move.
 */
@Component
class RoundScoring(private val plays: RoundPlayRepository) {

    private val logger = KotlinLogging.logger {}

    /** Returns how many rows changed — `0` means the stored points were already correct. */
    @Transactional
    fun reevaluate(round: RoundGame): Int {
        val guessed = plays.findByRoundGameId(requireNotNull(round.id)).filter { it.guessedAt != null }
        val points = pointsFor(
            award = Award(rule = round.awardRule, points = round.awardPoints),
            verdicts = guessed.map { play ->
                Verdict(
                    playId = requireNotNull(play.id),
                    qualifies = play.qualifies == true,
                    // A guessed row always carries a deviation; treating a missing one as "infinitely
                    // far off" keeps a broken row out of the win rather than crashing the round.
                    deviation = play.deviation ?: Double.MAX_VALUE,
                )
            },
        )

        var written = 0
        for (play in guessed) {
            val now = points[requireNotNull(play.id)] ?: 0
            if (play.points == now) continue
            if ((play.points ?: 0) > now) {
                // The one place behaviour degrades silently: somebody's points vanished, and in a
                // support case it would otherwise be their word against ours.
                logger.info {
                    "round ${round.roundNumber}: user ${play.userId} drops from ${play.points} to $now points"
                }
            }
            plays.save(play.copy(points = now))
            written++
        }
        return written
    }
}
