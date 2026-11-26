package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.rng.SeededRandom

/**
 * Which game a round gets.
 *
 * A pure function over the candidates and the run's history, and it receives the **whole** history
 * rather than just the previous round on purpose: "not within the last three", even distribution and
 * weighting all live in that list already, so the next rule is a change here and nowhere else. Had
 * the resolution passed only the previous type, every one of those would have meant changing the
 * query, the service and their tests.
 *
 * `null` means no type is available. Filtering [candidates] — a game whose content a community has
 * not provided yet — happens **before** the call and does not touch the rule either.
 */
fun interface GameSelection {
    /** [history] is most-recently-played first. */
    fun pick(candidates: List<String>, history: List<PastRound>, random: SeededRandom): String?
}

/**
 * The games of the last rounds are blocked; the next one is drawn uniformly from the rest.
 *
 * With 14 candidates the last 10 rounds block, 4 stay free. Uniform choice gave each game 5 to 15
 * rounds over an edition of 140; this gives 8 to 12. A game arriving mid-edition is unblocked,
 * comes up soon and then runs with the others — it does not catch up. That the next game becomes
 * guessable is fine: which game comes is no secret.
 *
 * At least the previous round blocks, so a catalogue of up to five falls back to "not twice in a
 * row". A **preference, not an exclusion criterion** — if honouring it would leave nothing, the rule
 * drops rather than the round losing its game.
 */
@Component
class NotRecentlyPlayed : GameSelection {
    override fun pick(candidates: List<String>, history: List<PastRound>, random: SeededRandom): String? {
        if (candidates.isEmpty()) return null

        // A type no longer available still takes its slot; more than UNBLOCKED stay free then.
        val blockedRounds = maxOf(1, candidates.size - UNBLOCKED)
        val blocked = history.take(blockedRounds).map { it.gameType }.toSet()

        val free = candidates.filterNot { it in blocked }
        return random.pick(free.ifEmpty { candidates })
    }

    companion object {
        /** How many candidates the block leaves free. Fewer is more even but closer to a fixed cycle. */
        const val UNBLOCKED = 4
    }
}
